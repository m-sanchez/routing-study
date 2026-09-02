/** The real-model arm: the same question, asked of a real model.
 *
 * The main study proves the toolkit MEASURES correctly on a world where the
 * truth is planted. That says nothing about whether routing to specialists
 * helps with an actual model. This arm asks: on questions with a checkable
 * answer, does routing each question to a domain-primed instance of one
 * cheap model beat sending everything to a generically-primed instance of
 * the same model - and does the toolkit report that honestly?
 *
 * Everything the model says is RECORDED. Every request is keyed by a hash of
 * (model, system prompt, question) and appended to a transcript; a replay run
 * answers from the transcript and never opens a socket. CI only ever replays.
 * A live run needs a credential and spends money, so it is a deliberate act:
 * `npm run real -- --live`, never a default and never in CI.
 *
 * What this is not: it is one model, one prompt set, one day. The numbers it
 * produces are a snapshot, and the README says so. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareModels } from '@m-sanchez/ab-significance';
import { calibrationError } from '@m-sanchez/calibrated';
import { route, selectedModel } from '@m-sanchez/careful-router';
import type { ModelRecord } from '@m-sanchez/careful-router';
import { appendRun, evaluateBars, freeze, runEval, verifyCorpus, verifyLedger } from '@m-sanchez/frozen-eval';
import type { Bar, Corpus, EvalRun } from '@m-sanchez/frozen-eval';
import { DOMAINS, seeded } from './world.ts';
import type { Domain } from './world.ts';

/** Haiku-tier by decision: this arm is about routing, not model quality, and
 * it must be cheap enough to re-record without thinking about it. */
export const REAL_MODEL = 'claude-haiku-4-5';
export const ECE_BINS = 10;

export const BARS: Bar[] = [
  { metric: 'accuracy', op: '>=', value: 0.75, note: 'the same ship bar as the synthetic study' },
  { metric: 'ece', op: '<=', value: 0.1, note: 'the same calibration bar as the synthetic study' }
];

// ── questions with checkable answers ────────────────────────────────────

export interface Question {
  id: string;
  domain: Domain;
  prompt: string;
  /** the one acceptable answer, after normalisation */
  answer: string;
}

const pick = <T>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (rand: () => number, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const PAYEES = ['Alder Logistics', 'Marram Freight', 'Quayside Marine', 'Tern Analytics', 'Bracken Tools'];
const NODES = ['A', 'B', 'C', 'D', 'E', 'F'];
const EVENTS = ['the audit', 'the migration', 'the outage', 'the launch', 'the renewal'];

/** ledger: a handful of payments, one arithmetic or counting question. */
function ledgerQuestion(rand: () => number, i: number): Question {
  const rows = Array.from({ length: int(rand, 6, 9) }, () => ({
    payee: pick(rand, PAYEES),
    amount: int(rand, 10, 900)
  }));
  const target = pick(rand, PAYEES);
  const mine = rows.filter((r) => r.payee === target);
  const ask = rand() < 0.5 ? 'total' : 'count';
  const answer = ask === 'total' ? String(mine.reduce((s, r) => s + r.amount, 0)) : String(mine.length);
  const table = rows.map((r) => `${r.payee}: ${r.amount}`).join('\n');
  const prompt =
    `Payments:\n${table}\n\n` +
    (ask === 'total'
      ? `What is the total amount paid to ${target}? Answer with the number only.`
      : `How many payments went to ${target}? Answer with the number only.`);
  return { id: `ledger-${i}`, domain: 'ledger', prompt, answer };
}

/** network: a small directed graph, one reachability question. */
function networkQuestion(rand: () => number, i: number): Question {
  const edges = new Set<string>();
  const n = int(rand, 5, 8);
  while (edges.size < n) {
    const a = pick(rand, NODES);
    const b = pick(rand, NODES);
    if (a !== b) edges.add(`${a}>${b}`);
  }
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = e.split('>');
    adj.set(a, [...(adj.get(a) ?? []), b]);
  }
  const from = pick(rand, NODES);
  const to = pick(rand, NODES.filter((x) => x !== from));
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...(adj.get(x) ?? []));
  }
  const answer = seen.has(to) ? 'yes' : 'no';
  const list = [...edges].map((e) => e.replace('>', ' -> ')).join(', ');
  const prompt =
    `Directed links: ${list}.\n\n` +
    `Following the arrows only, can a packet get from ${from} to ${to}? Answer yes or no only.`;
  return { id: `network-${i}`, domain: 'network', prompt, answer };
}

/** timeline: dated events, days between two of them. */
function timelineQuestion(rand: () => number, i: number): Question {
  const base = Date.UTC(2025, 0, 1);
  const names = [...EVENTS].sort(() => rand() - 0.5).slice(0, 4);
  const days = names.map(() => int(rand, 0, 300)).sort((a, b) => a - b);
  const dated = names.map((name, k) => ({ name, day: days[k] }));
  const [x, y] = [pick(rand, dated), pick(rand, dated)];
  const fmt = (d: number) => new Date(base + d * 86_400_000).toISOString().slice(0, 10);
  const lines = dated.map((d) => `${d.name}: ${fmt(d.day)}`).join('\n');
  const answer = String(Math.abs(x.day - y.day));
  const prompt =
    `Events:\n${lines}\n\n` +
    `How many days apart are ${x.name} and ${y.name}? Answer with the number only.`;
  return { id: `timeline-${i}`, domain: 'timeline', prompt, answer };
}

/** identity: two records, same entity or not, with the usual noise. */
function identityQuestion(rand: () => number, i: number): Question {
  const first = pick(rand, ['Ana', 'Jon', 'Mei', 'Omar', 'Sofia']);
  const last = pick(rand, ['Reyes', 'Okafor', 'Lindqvist', 'Tanaka', 'Moreau']);
  const same = rand() < 0.5;
  const a = { name: `${first} ${last}`, email: `${first}.${last}@example.com`.toLowerCase() };
  const b = same
    ? { name: `${last.toUpperCase()}, ${first[0]}.`, email: a.email.replace('@', '+work@').toUpperCase() }
    : {
        name: `${first} ${pick(rand, ['Reyes', 'Okafor', 'Lindqvist', 'Tanaka', 'Moreau'].filter((l) => l !== last))}`,
        email: `${first}.${int(rand, 2, 9)}@example.com`.toLowerCase()
      };
  const answer = same ? 'yes' : 'no';
  const prompt =
    `Record 1: name "${a.name}", email ${a.email}\nRecord 2: name "${b.name}", email ${b.email}\n\n` +
    `Treat a "+tag" in the local part of an email as the same mailbox. ` +
    `Do these two records refer to the same person? Answer yes or no only.`;
  return { id: `identity-${i}`, domain: 'identity', prompt, answer };
}

export function generateQuestions(perDomain: number, seed: number): Question[] {
  const rand = seeded(seed);
  const gens: Record<Domain, (r: () => number, i: number) => Question> = {
    ledger: ledgerQuestion,
    network: networkQuestion,
    timeline: timelineQuestion,
    identity: identityQuestion
  };
  const out: Question[] = [];
  for (const d of DOMAINS) for (let i = 0; i < perDomain; i++) out.push(gens[d](rand, i));
  return out;
}

// ── the systems: one model, primed differently ──────────────────────────

const CONFIDENCE_RULE =
  'After your answer, on a new line write CONFIDENCE: followed by a number from 0 to 1 ' +
  'giving the probability that your answer is correct. Be honest: 0.5 means a coin flip.';

export const PRIMING: Record<'generalist' | Domain, string> = {
  generalist: `You answer short factual questions precisely. ${CONFIDENCE_RULE}`,
  ledger: `You are a bookkeeping specialist. Add and count carefully, one row at a time, before answering. ${CONFIDENCE_RULE}`,
  network: `You are a network engineer. Trace directed links strictly in arrow direction, never backwards. ${CONFIDENCE_RULE}`,
  timeline: `You are a scheduler. Work with dates by converting to day numbers before subtracting. ${CONFIDENCE_RULE}`,
  identity: `You are an identity-resolution specialist. Normalise case and email tags before comparing. ${CONFIDENCE_RULE}`
};

/** careful-router routes over capability records. Each record is the same
 * model behind a different priming - the honest real-world shape of a
 * "specialist" when you only have one model. Prices are the model's real
 * list prices; specialists are not discounted, so routing chooses on
 * capability alone and the generalist only wins where nothing else declares
 * the domain. */
const M = 1_000_000;
const HAIKU_IN = 1 * M;
const HAIKU_OUT = 5 * M;

export function registry(): ModelRecord[] {
  const base = { provider: 'anthropic', contextWindow: 200_000, maxOutput: 8_192, boundary: 'external' as const };
  return [
    { id: 'haiku:generalist', ...base, inUsdMicrosPerMTok: HAIKU_IN + 1, outUsdMicrosPerMTok: HAIKU_OUT, capabilities: [...DOMAINS] },
    ...DOMAINS.map((d) => ({
      id: `haiku:${d}`,
      ...base,
      inUsdMicrosPerMTok: HAIKU_IN,
      outUsdMicrosPerMTok: HAIKU_OUT,
      capabilities: [d]
    }))
  ];
}

const primingOf = (recordId: string): string => {
  const key = recordId.split(':')[1] as 'generalist' | Domain;
  return PRIMING[key];
};

// ── the transcript: record everything, replay without a socket ──────────

export interface TranscriptEntry {
  key: string;
  model: string;
  system: string;
  prompt: string;
  text: string;
  recordedAt: string;
  usage?: { input: number; output: number };
}

export const keyOf = (model: string, system: string, prompt: string) =>
  createHash('sha256').update(`${model} ${system} ${prompt}`).digest('hex');

export const TRANSCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'study', 'transcripts');
export const TRANSCRIPT_PATH = join(TRANSCRIPT_DIR, 'real.jsonl');
export const SUMMARY_PATH = join(TRANSCRIPT_DIR, 'real.summary.json');

export function loadTranscript(path = TRANSCRIPT_PATH): Map<string, TranscriptEntry> {
  const map = new Map<string, TranscriptEntry>();
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as TranscriptEntry;
    map.set(e.key, e);
  }
  return map;
}

/** Whatever answers a prompt. Live mode wraps the SDK; replay mode reads the
 * transcript; tests inject a fake. The arm never decides this itself. */
export type Ask = (model: string, system: string, prompt: string) => Promise<string>;

export interface Recorder {
  ask: Ask;
  /** how many answers came from a socket rather than the transcript */
  liveCalls: () => number;
}

/** Replay-only asker: a miss is an error, never a silent live call. */
export function replayAsker(transcript: Map<string, TranscriptEntry>): Recorder {
  return {
    ask: async (model, system, prompt) => {
      const hit = transcript.get(keyOf(model, system, prompt));
      if (!hit) {
        throw new Error(
          `no transcript entry for this (model, priming, question); the transcript does not cover this run. ` +
            `Re-record with: npm run real -- --live`
        );
      }
      return hit.text;
    },
    liveCalls: () => 0
  };
}

/** Live asker: answers from the transcript when it can, otherwise calls the
 * model through the official SDK and appends the exchange. Refuses to exist
 * in CI: a credential in CI would make "replayed in CI" a lie. */
export async function liveAsker(transcript: Map<string, TranscriptEntry>, path = TRANSCRIPT_PATH): Promise<Recorder> {
  if (process.env.CI) throw new Error('live mode is refused under CI: CI replays the transcript, it never records one');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  mkdirSync(dirname(path), { recursive: true });
  let live = 0;
  return {
    ask: async (model, system, prompt) => {
      const key = keyOf(model, system, prompt);
      const hit = transcript.get(key);
      if (hit) return hit.text;
      const response = await client.messages.create({
        model,
        max_tokens: 256,
        system,
        messages: [{ role: 'user', content: prompt }]
      });
      const text = response.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      const entry: TranscriptEntry = {
        key,
        model,
        system,
        prompt,
        text,
        recordedAt: new Date().toISOString(),
        usage: { input: response.usage.input_tokens, output: response.usage.output_tokens }
      };
      appendFileSync(path, JSON.stringify(entry) + '\n');
      transcript.set(key, entry);
      live++;
      return text;
    },
    liveCalls: () => live
  };
}

// ── scoring ─────────────────────────────────────────────────────────────

export interface RealScored {
  id: string;
  domain: Domain;
  correct: boolean;
  confidence: number;
  routedTo: string;
  said: string;
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/confidence:.*$/is, '')
    .replace(/[^a-z0-9.\-]/g, ' ')
    .trim()
    .split(/\s+/)[0] ?? '';

/** Parse the model's stated confidence; a missing or unparseable statement is
 * recorded as 0.5, which is the honest reading of "did not say". */
export function parseConfidence(text: string): number {
  const m = /confidence:\s*([01](?:\.\d+)?|\.\d+)/i.exec(text);
  if (!m) return 0.5;
  const v = Number(m[1]);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
}

export function score(q: Question, text: string, routedTo: string): RealScored {
  const said = normalise(text);
  const want = normalise(q.answer);
  // numbers compare numerically so "1,234" and "1234" agree
  const correct = Number.isFinite(Number(want)) ? Number(said) === Number(want) : said === want;
  return { id: q.id, domain: q.domain, correct, confidence: parseConfidence(text), routedTo, said };
}

export async function runGeneralist(questions: Question[], rec: Recorder): Promise<RealScored[]> {
  const out: RealScored[] = [];
  for (const q of questions) out.push(score(q, await rec.ask(REAL_MODEL, PRIMING.generalist, q.prompt), 'haiku:generalist'));
  return out;
}

/** Routed: careful-router decides per question from the capability records;
 * the arm only executes what the record selected. */
export async function runRouted(questions: Question[], rec: Recorder): Promise<RealScored[]> {
  const reg = registry();
  const out: RealScored[] = [];
  for (const q of questions) {
    const record = route({ task: `answer a ${q.domain} question`, requires: [q.domain] }, reg);
    const chosen = selectedModel(record);
    if (!chosen) throw new Error(`router could not route a ${q.domain} question: ${JSON.stringify(record.outcome)}`);
    out.push(score(q, await rec.ask(REAL_MODEL, primingOf(chosen.id), q.prompt), chosen.id));
  }
  return out;
}

// ── the study over real answers, composed from the toolkit ──────────────

export interface RealSystem {
  label: string;
  accuracy: number;
  ece: number;
  verdict: ReturnType<typeof evaluateBars>;
  perDomain: Record<string, number>;
}

export interface RealReport {
  model: string;
  seed: number;
  perDomain: number;
  n: number;
  mode: 'live' | 'replay';
  liveCalls: number;
  manifestHash: string;
  ledger: { entries: number; intact: boolean; replayed: boolean; reason?: string };
  systems: RealSystem[];
  comparison: ReturnType<typeof compareModels>;
  routedBeatsGeneralist: boolean;
}

const eceOf = (perItem: EvalRun['perItem']) =>
  calibrationError(
    perItem.map((row) => ({ confidence: Number(row.scores.confidence), correct: Boolean(row.scores.accuracy) })),
    ECE_BINS
  ).ece;

const accuracyOf = (rows: RealScored[]) => rows.filter((r) => r.correct).length / (rows.length || 1);
const perDomainAccuracy = (rows: RealScored[]) => {
  const out: Record<string, number> = {};
  for (const d of DOMAINS) {
    const x = rows.filter((r) => r.domain === d);
    out[d] = x.filter((r) => r.correct).length / (x.length || 1);
  }
  return out;
};

export async function runReal(opts: {
  seed?: number;
  perDomain?: number;
  recorder: Recorder;
  mode: 'live' | 'replay';
}): Promise<RealReport> {
  const seed = opts.seed ?? 1;
  const perDomain = opts.perDomain ?? 100;
  const questions = generateQuestions(perDomain, seed);
  const corpus: Corpus = { all: questions.map((q) => ({ id: q.id, input: q.prompt, expected: q.answer })) };
  const manifest = freeze(corpus, BARS);
  if (!verifyCorpus(manifest, corpus)) throw new Error('the corpus does not match the manifest it was frozen under');

  const g = await runGeneralist(questions, opts.recorder);
  const routed = await runRouted(questions, opts.recorder);

  const runs: EvalRun[] = [];
  const systems: RealSystem[] = [];
  for (const [label, rows] of [
    ['generalist priming', g],
    ['careful-router routed priming', routed]
  ] as const) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const run = await runEval({
      manifest,
      corpus,
      split: 'all',
      label,
      judge: (item) => ({ accuracy: byId.get(item.id)!.correct, confidence: byId.get(item.id)!.confidence }),
      corpusJudge: (perItem) => ({ ece: eceOf(perItem) })
    });
    runs.push(run);
    systems.push({
      label,
      accuracy: accuracyOf(rows),
      ece: run.aggregate.ece!.value,
      verdict: evaluateBars(run.aggregate, BARS),
      perDomain: perDomainAccuracy(rows)
    });
  }

  let ledgerText = '';
  for (const run of runs) ledgerText = appendRun(ledgerText, run);
  const ledgerCheck = verifyLedger(ledgerText, { manifest, corpus, corpusJudge: (perItem) => ({ ece: eceOf(perItem) }) });

  const comparison = compareModels(
    g.map((r) => ({ id: r.id, correct: r.correct })),
    routed.map((r) => ({ id: r.id, correct: r.correct })),
    { minEffectPct: 2 }
  );

  return {
    model: REAL_MODEL,
    seed,
    perDomain,
    n: questions.length,
    mode: opts.mode,
    liveCalls: opts.recorder.liveCalls(),
    manifestHash: manifest.manifestHash,
    ledger: {
      entries: ledgerCheck.entries,
      intact: ledgerCheck.intact,
      replayed: ledgerCheck.replayed,
      ...(ledgerCheck.reason ? { reason: ledgerCheck.reason } : {})
    },
    systems,
    comparison,
    routedBeatsGeneralist: comparison.verdict === 'B better'
  };
}

/** The numbers a recorded run produced, pinned beside the transcript so a
 * replay can be held to them. */
export interface RealSummary {
  model: string;
  seed: number;
  perDomain: number;
  recordedAt: string;
  manifestHash: string;
  systems: Array<{ label: string; accuracy: number; ece: number; perDomain: Record<string, number> }>;
  verdict: string;
  mcnemarP: number;
}

export function summarise(report: RealReport, recordedAt: string): RealSummary {
  return {
    model: report.model,
    seed: report.seed,
    perDomain: report.perDomain,
    recordedAt,
    manifestHash: report.manifestHash,
    systems: report.systems.map((s) => ({ label: s.label, accuracy: s.accuracy, ece: s.ece, perDomain: s.perDomain })),
    verdict: report.comparison.verdict,
    mcnemarP: report.comparison.mcnemar.p
  };
}

export function writeSummary(summary: RealSummary, path = SUMMARY_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(summary, null, 2) + '\n');
}
