import { compareModels } from '@m-sanchez/ab-significance';
import { DOMAINS } from './world.ts';
import type { Domain } from './world.ts';
import { REAL_MODEL, generateQuestions, runGeneralist, runRouted, score } from './real.ts';
import type { Question, Recorder, RealScored } from './real.ts';

export type AnswerKind = 'number' | 'yes-no' | 'token';

export function answerKind(answer: string): AnswerKind {
  if (/^\d+$/.test(answer)) return 'number';
  if (answer === 'yes' || answer === 'no') return 'yes-no';
  return 'token';
}

const CONFIDENCE_TAIL = /confidence:.*$/is;

export const isTruncated = (text: string): boolean => !/confidence:/i.test(text);

const lastOf = (xs: RegExpMatchArray | null): string | null => (xs && xs.length ? xs[xs.length - 1] : null);

export function finalAnswer(text: string, kind: AnswerKind): string | null {
  const body = text.replace(CONFIDENCE_TAIL, '');
  if (kind === 'number') {
    // no minus sign: the hyphens in ISO dates would read as negative numbers
    const n = lastOf(body.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g));
    return n === null ? null : n.replace(/,/g, '');
  }
  if (kind === 'yes-no') return lastOf(body.toLowerCase().match(/\b(?:yes|no)\b/g));
  const tokens = body.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  return tokens[tokens.length - 1].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || null;
}

const sameAnswer = (said: string, answer: string, kind: AnswerKind) =>
  kind === 'number' ? said !== '' && Number(said) === Number(answer) : said === answer;

export interface FinalScored {
  id: string;
  correct: boolean;
  truncated: boolean;
  said: string | null;
}

export function scoreFinal(q: Question, text: string): FinalScored {
  const kind = answerKind(q.answer);
  const truncated = isTruncated(text);
  const said = finalAnswer(text, kind);
  return { id: q.id, correct: !truncated && said !== null && sameAnswer(said, q.answer, kind), truncated, said };
}

export const CATEGORIES = [
  'opened with working',
  'trailing punctuation',
  'opened with a wrong answer',
  'truncated',
  'genuinely wrong answer'
] as const;
export type Category = (typeof CATEGORIES)[number];

const isAnswerShaped = (token: string, kind: AnswerKind) =>
  kind === 'number' ? /^\d+(?:\.\d+)?$/.test(token) : kind === 'yes-no' ? token === 'yes' || token === 'no' : token !== '';

export function classify(q: Question, text: string): Category | null {
  const kind = answerKind(q.answer);
  const strict = score(q, text, '');
  const final = scoreFinal(q, text);
  if (strict.correct && final.correct) return null;
  if (final.correct) {
    // the strict normaliser keeps only '.' and '-' as punctuation
    const first = strict.said.replace(/[.-]+$/, '');
    if (first !== strict.said && sameAnswer(first, q.answer, kind)) return 'trailing punctuation';
    return isAnswerShaped(first, kind) ? 'opened with a wrong answer' : 'opened with working';
  }
  return final.truncated ? 'truncated' : 'genuinely wrong answer';
}

export const ARMS = ['generalist', 'routed'] as const;
export type Arm = (typeof ARMS)[number];
export type Scorer = 'strict' | 'final';

type ByArm<T> = Record<Arm, T>;
type Tally = Record<Category, number>;

export interface ScorerSummary {
  correct: ByArm<number>;
  perDomain: Record<Domain, ByArm<number>>;
  b: number;
  c: number;
  p: number;
  diffPp: number;
  low: number;
  high: number;
  verdict: string;
}

export interface Rescore {
  model: string;
  n: number;
  perDomain: number;
  scorers: Record<Scorer, ScorerSummary>;
  strictMisses: ByArm<Tally>;
  strictRightFinalWrong: ByArm<number>;
  discordant: Record<Scorer, { b: Tally; c: Tally }>;
  truncated: ByArm<{ replies: number; wouldMatch: number }>;
}

const emptyTally = (): Tally => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Tally;

interface Row {
  q: Question;
  text: string;
  strict: boolean;
  final: FinalScored;
}

async function replayArm(
  questions: Question[],
  base: Recorder,
  run: (qs: Question[], rec: Recorder) => Promise<RealScored[]>
): Promise<Row[]> {
  const replies = new Map<string, string>();
  const rec: Recorder = {
    ask: async (model, system, prompt) => {
      const text = await base.ask(model, system, prompt);
      replies.set(prompt, text);
      return text;
    },
    liveCalls: base.liveCalls
  };
  const strict = await run(questions, rec);
  return questions.map((q, i) => {
    if (strict[i].id !== q.id) throw new Error(`arm rows out of order at ${q.id}`);
    const text = replies.get(q.prompt)!;
    return { q, text, strict: strict[i].correct, final: scoreFinal(q, text) };
  });
}

function summarise(rows: ByArm<Row[]>, correct: (r: Row) => boolean): ScorerSummary {
  const outcomes = (arm: Arm) => rows[arm].map((r) => ({ id: r.q.id, correct: correct(r) }));
  const cmp = compareModels(outcomes('generalist'), outcomes('routed'), { minEffectPct: 2 });
  const count = (arm: Arm, d?: Domain) => rows[arm].filter((r) => (d === undefined || r.q.domain === d) && correct(r)).length;
  const byArm = (d?: Domain) => ({ generalist: count('generalist', d), routed: count('routed', d) });
  return {
    correct: byArm(),
    perDomain: Object.fromEntries(DOMAINS.map((d) => [d, byArm(d)])) as Record<Domain, ByArm<number>>,
    b: cmp.table.aOnly,
    c: cmp.table.bOnly,
    p: cmp.mcnemar.p,
    diffPp: cmp.bootstrap.observed,
    low: cmp.bootstrap.low,
    high: cmp.bootstrap.high,
    verdict: cmp.verdict
  };
}

export async function runRescore(recorder: Recorder, opts: { seed?: number; perDomain?: number } = {}): Promise<Rescore> {
  const perDomain = opts.perDomain ?? 100;
  const questions = generateQuestions(perDomain, opts.seed ?? 1);
  const rows: ByArm<Row[]> = {
    generalist: await replayArm(questions, recorder, runGeneralist),
    routed: await replayArm(questions, recorder, runRouted)
  };

  const strictMisses = { generalist: emptyTally(), routed: emptyTally() };
  const strictRightFinalWrong = { generalist: 0, routed: 0 };
  const truncated = { generalist: { replies: 0, wouldMatch: 0 }, routed: { replies: 0, wouldMatch: 0 } };
  for (const arm of ARMS) {
    for (const r of rows[arm]) {
      const why = classify(r.q, r.text);
      if (!r.strict) strictMisses[arm][why!]++;
      else if (!r.final.correct) strictRightFinalWrong[arm]++;
      if (r.final.truncated) {
        truncated[arm].replies++;
        if (r.final.said !== null && sameAnswer(r.final.said, r.q.answer, answerKind(r.q.answer))) truncated[arm].wouldMatch++;
      }
    }
  }

  const discordant = { strict: { b: emptyTally(), c: emptyTally() }, final: { b: emptyTally(), c: emptyTally() } };
  for (const [i, g] of rows.generalist.entries()) {
    const r = rows.routed[i];
    for (const [scorer, right] of [
      ['strict', (x: Row) => x.strict],
      ['final', (x: Row) => x.final.correct]
    ] as const) {
      if (right(g) && !right(r)) discordant[scorer].b[classify(r.q, r.text)!]++;
      if (!right(g) && right(r)) discordant[scorer].c[classify(g.q, g.text)!]++;
    }
  }

  return {
    model: REAL_MODEL,
    n: questions.length,
    perDomain,
    scorers: { strict: summarise(rows, (r) => r.strict), final: summarise(rows, (r) => r.final.correct) },
    strictMisses,
    strictRightFinalWrong,
    discordant,
    truncated
  };
}

const pct = (k: number, n: number) => `${((100 * k) / n).toFixed(1)}%`;
const pValue = (p: number) => (p < 0.0001 ? p.toExponential(2) : p.toFixed(4));
const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

export function formatRescore(r: Rescore): string {
  const { strict, final } = r.scorers;
  const out: string[] = [];
  out.push(
    `re-scoring the real-model arm (post hoc) - ${r.model}, ${r.n} questions, replayed from the transcript (no network)`,
    '',
    'strict: the first token of the reply, as registered. final answer: the last answer the reply states, chosen after seeing the replies.',
    '',
    'accuracy              strict              final answer'
  );
  for (const arm of ARMS) {
    const cell = (s: ScorerSummary) => `${s.correct[arm]}/${r.n}  ${pct(s.correct[arm], r.n)}`.padEnd(20);
    out.push(`  ${arm.padEnd(18)}  ${cell(strict)}${cell(final)}`.trimEnd());
  }
  out.push('', `per domain, generalist / routed, of ${r.perDomain} each`, '              strict        final answer');
  for (const d of DOMAINS) {
    const cell = (s: ScorerSummary) => `${String(s.perDomain[d].generalist).padStart(3)} / ${String(s.perDomain[d].routed).padStart(3)}`;
    out.push(`  ${d.padEnd(10)}  ${cell(strict)}     ${cell(final)}`);
  }
  out.push(
    '',
    'A = generalist, B = routed. exact McNemar: b = A right and B wrong, c = the reverse; B - A with 95% bootstrap interval'
  );
  for (const [label, s] of [
    ['strict', strict],
    ['final answer', final]
  ] as const) {
    out.push(
      `  ${label.padEnd(13)} b ${String(s.b).padStart(2)}  c ${String(s.c).padStart(2)}  p ${pValue(s.p).padEnd(8)} ` +
        `${signed(s.diffPp)}pp [${s.low.toFixed(1)}, ${s.high.toFixed(1)}]  ${s.verdict}`
    );
  }
  out.push('', `${'why the strict scorer marked a reply wrong'.padEnd(44)}generalist  routed  final-answer scorer`);
  const row = (label: string, g: number, rt: number, tail = '') =>
    `  ${label.padEnd(42)}${String(g).padStart(10)}${String(rt).padStart(8)}${tail ? `  ${tail}` : ''}`;
  for (const c of CATEGORIES) {
    const verdict = c === 'truncated' || c === 'genuinely wrong answer' ? 'wrong' : 'right';
    out.push(row(c, r.strictMisses.generalist[c], r.strictMisses.routed[c], verdict));
  }
  const total = (arm: Arm) => CATEGORIES.reduce((s, c) => s + r.strictMisses[arm][c], 0);
  out.push(row('total', total('generalist'), total('routed')));
  out.push(
    `marked right by the strict scorer and wrong by the final-answer scorer: generalist ${r.strictRightFinalWrong.generalist}, routed ${r.strictRightFinalWrong.routed}`
  );
  const listed = (t: Tally) => CATEGORIES.filter((c) => t[c] > 0).map((c) => `${c} ${t[c]}`).join(', ') || 'none';
  out.push('', 'the losing reply on each discordant pair');
  for (const [label, scorer] of [
    ['strict', 'strict'],
    ['final answer', 'final']
  ] as const) {
    const s = r.scorers[scorer];
    out.push(
      `  ${label} b: the ${s.b} routed replies where only the generalist was right: ${listed(r.discordant[scorer].b)}`,
      `  ${label} c: the ${s.c} generalist replies where only routed was right: ${listed(r.discordant[scorer].c)}`
    );
  }
  out.push(
    '',
    `truncated at the 256-token limit: generalist ${r.truncated.generalist.replies}, routed ${r.truncated.routed.replies}; ` +
      `${r.truncated.routed.wouldMatch + r.truncated.generalist.wouldMatch} of them would match the answer under rules 3 and 4 and still count as wrong`,
    '',
    'The final-answer rule was chosen after the data was seen. It shows what the strict scorer measured;',
    'it is not a new registered result, and the recorded verdict stays the strict one.'
  );
  return out.join('\n');
}
