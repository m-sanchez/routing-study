/** The real-model arm, held to what it promises without spending a cent.
 *
 * Nothing here opens a socket. The arm takes whatever answers a prompt by
 * injection, so these tests hand it a fake that answers like a model would
 * and check the machinery around it: the questions are checkable, routing
 * dispatches by domain, the composition with frozen-eval / calibrated /
 * ab-significance holds, replay refuses to guess, and live mode refuses CI.
 * When a recorded transcript and pinned summary exist, replay must reproduce
 * the pinned numbers exactly. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PRIMING,
  REAL_MODEL,
  SUMMARY_PATH,
  TRANSCRIPT_PATH,
  generateQuestions,
  keyOf,
  liveAsker,
  loadTranscript,
  parseConfidence,
  registry,
  replayAsker,
  runReal,
  score,
  summarise
} from '../src/real.ts';
import type { Recorder, RealSummary, TranscriptEntry } from '../src/real.ts';
import { validateRegistry } from '@m-sanchez/careful-router';

/** A stand-in model: right on its own domain most of the time, worse off it,
 * overconfident either way - the shape the synthetic study plants. Seeded
 * by hashing the prompt so it is deterministic and needs no RNG state. */
function fakeRecorder(): Recorder {
  const answers = new Map(generateQuestions(20, 1).map((q) => [q.prompt, q]));
  let calls = 0;
  return {
    ask: async (_model, system, prompt) => {
      calls++;
      const q = answers.get(prompt)!;
      const primedFor = Object.entries(PRIMING).find(([, s]) => s === system)?.[0];
      const onLane = primedFor === q.domain;
      const h = [...keyOf(REAL_MODEL, system, prompt)].reduce((a, c) => a + c.charCodeAt(0), 0);
      const right = onLane ? h % 10 < 9 : h % 10 < 6;
      const said = right ? q.answer : q.domain === 'network' || q.domain === 'identity' ? (q.answer === 'yes' ? 'no' : 'yes') : String(Number(q.answer) + 1);
      return `${said}\nCONFIDENCE: 0.95`;
    },
    liveCalls: () => calls
  };
}

test('every generated question has one checkable answer and a stable id', () => {
  const qs = generateQuestions(5, 7);
  assert.equal(qs.length, 20);
  for (const q of qs) {
    assert.ok(q.answer.length > 0, `${q.id} has an answer`);
    assert.ok(/^(yes|no|\d+)$/.test(q.answer), `${q.id} answer "${q.answer}" is a number or yes/no`);
    assert.ok(q.prompt.includes('Answer'), `${q.id} tells the model the answer shape`);
  }
  assert.deepEqual(generateQuestions(5, 7), qs, 'the same seed regenerates the same questions');
  assert.notDeepEqual(generateQuestions(5, 8), qs, 'a different seed does not');
});

test('the registry is valid and routes every domain to its primed instance', async () => {
  assert.deepEqual(validateRegistry(registry()), [], 'careful-router accepts the registry');
  const rec = fakeRecorder();
  const report = await runReal({ perDomain: 20, recorder: rec, mode: 'replay' });
  // the fake's on-lane answers are right 90% of the time and off-lane 60%,
  // so a routed run that dispatched correctly must beat the generalist
  assert.ok(report.systems[1].accuracy > report.systems[0].accuracy, 'routing reached the primed instances');
  assert.equal(rec.liveCalls(), 160, 'every question was asked once per system');
});

test('scoring compares numbers numerically and words exactly, and reads the stated confidence', () => {
  const q = generateQuestions(1, 1)[0]; // a ledger question, numeric answer
  assert.ok(score(q, `${Number(q.answer).toLocaleString('en-US')}\nCONFIDENCE: 0.8`, 'x').correct, 'thousands separators do not fail a number');
  assert.equal(score(q, 'not a number\nCONFIDENCE: 0.8', 'x').correct, false);
  assert.equal(parseConfidence('42\nCONFIDENCE: 0.73'), 0.73);
  assert.equal(parseConfidence('42'), 0.5, 'no statement reads as a coin flip, not as certainty');
  assert.equal(parseConfidence('42\nCONFIDENCE: 7'), 0.5, 'an out-of-range number is not trusted');
});

test('the composition holds: verified manifest, replayed ledger, an honest verdict', async () => {
  const report = await runReal({ perDomain: 20, recorder: fakeRecorder(), mode: 'replay' });
  assert.equal(report.n, 80);
  assert.match(report.manifestHash, /^[0-9a-f]{64}$/);
  assert.equal(report.ledger.entries, 2);
  assert.ok(report.ledger.intact);
  assert.ok(report.ledger.replayed, 'the ledger arithmetic was recomputed, not just chain-walked');
  assert.ok(['B better', 'A better', 'no separable difference', 'instruments disagree', 'insufficient overlap'].includes(report.comparison.verdict));
  for (const s of report.systems) {
    assert.ok(s.ece >= 0 && s.ece <= 1);
    assert.equal(Object.keys(s.perDomain).length, 4);
  }
});

test('replay never guesses: a question the transcript does not cover is an error', async () => {
  const rec = replayAsker(new Map());
  await assert.rejects(() => rec.ask(REAL_MODEL, PRIMING.generalist, 'unseen'), /no transcript entry/);
  assert.equal(rec.liveCalls(), 0);
});

test('live mode is refused under CI before any credential is looked at', async () => {
  const had = process.env.CI;
  process.env.CI = 'true';
  try {
    await assert.rejects(() => liveAsker(new Map()), /refused under CI/);
  } finally {
    if (had === undefined) delete process.env.CI;
    else process.env.CI = had;
  }
});

test('the summary pins the transcript bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'routing-study-'));
  const path = join(dir, 'real.jsonl');
  const at = '2026-01-01T00:00:00.000Z';
  const entries: TranscriptEntry[] = [
    { key: 'k1', model: REAL_MODEL, system: PRIMING.generalist, prompt: 'p1', text: '1\nCONFIDENCE: 0.9', recordedAt: at, usage: { input: 10, output: 4 } },
    { key: 'k2', model: REAL_MODEL, system: PRIMING.ledger, prompt: 'p2', text: '2\nCONFIDENCE: 0.8', recordedAt: at, usage: { input: 15, output: 6 } },
    { key: 'k3', model: REAL_MODEL, system: PRIMING.network, prompt: 'p3', text: 'yes\nCONFIDENCE: 0.7', recordedAt: at }
  ];
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const report = await runReal({ perDomain: 20, recorder: fakeRecorder(), mode: 'replay' });
  const summary = summarise(report, at, path);
  const sha = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(summary.transcriptSha256, sha, 'the summary carries the sha256 of the transcript bytes');
  assert.equal(summary.liveCalls, report.liveCalls, 'the summary carries the live-call count of the run it pins');
  assert.deepEqual(summary.usage, { input: 25, output: 10 }, 'usage is summed over every entry; an entry without usage counts as zero');
  appendFileSync(path, '\n');
  const again = summarise(report, at, path);
  assert.notEqual(again.transcriptSha256, summary.transcriptSha256, 'one extra byte changes the pinned hash');
});

test('the question set repeats itself in one domain, and the README says by how much', () => {
  // the identity generator draws from a small space, so a run of 400 asks
  // fewer distinct questions than it counts. The README states the gap; if
  // the generator changes, the stated numbers have to change with it.
  const qs = generateQuestions(100, 1);
  assert.equal(qs.length, 400, 'the recorded run asked 400 questions');
  assert.equal(new Set(qs.map((q) => q.prompt)).size, 372, 'of which this many are distinct');
  const identity = qs.filter((q) => q.domain === 'identity').map((q) => q.prompt);
  assert.equal(identity.length - new Set(identity).size, 28, 'every repeat is an identity question');
  for (const d of ['ledger', 'network', 'timeline'] as const) {
    const ps = qs.filter((q) => q.domain === d).map((q) => q.prompt);
    assert.equal(new Set(ps).size, ps.length, `${d} asks no question twice`);
  }
  // a repeat is only harmless because it carries the same answer
  const answers = new Map<string, string>();
  for (const q of qs) {
    const seen = answers.get(q.prompt);
    if (seen !== undefined) assert.equal(q.answer, seen, 'a repeated question has one answer');
    answers.set(q.prompt, q.answer);
  }
});

test('the recorded provenance is the transcript it came from', { skip: !existsSync(SUMMARY_PATH) && 'no recorded run yet: npm run real -- --live' }, () => {
  // the README prints live calls and token spend out of the pinned summary;
  // both are recomputable from the committed transcript, so neither can be
  // typed in by hand.
  const pinned = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RealSummary;
  const entries = readFileSync(TRANSCRIPT_PATH, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as TranscriptEntry);
  assert.equal(entries.length, pinned.liveCalls, 'the pin claims a different number of calls than the transcript holds');
  const spent = entries.reduce(
    (acc, e) => ({ input: acc.input + (e.usage?.input ?? 0), output: acc.output + (e.usage?.output ?? 0) }),
    { input: 0, output: 0 }
  );
  assert.deepEqual(spent, pinned.usage, 'the pinned token spend is not what the transcript adds up to');
  assert.equal(new Set(entries.map((e) => e.key)).size, entries.length, 'a key was recorded twice');
});

test('a recorded run replays to exactly its pinned summary', { skip: !existsSync(SUMMARY_PATH) && 'no recorded run yet: npm run real -- --live' }, async () => {
  const pinned = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RealSummary;
  const transcript = loadTranscript(TRANSCRIPT_PATH);
  assert.ok(transcript.size > 0, 'a summary without a transcript cannot be replayed');
  assert.equal(createHash('sha256').update(readFileSync(TRANSCRIPT_PATH)).digest('hex'), pinned.transcriptSha256, 'the transcript was edited after it was pinned');
  assert.equal(pinned.liveCalls > 0, true, 'a recording that made no live calls is not a recording');
  const report = await runReal({ seed: pinned.seed, perDomain: pinned.perDomain, recorder: replayAsker(transcript), mode: 'replay' });
  assert.equal(report.model, pinned.model);
  assert.equal(report.manifestHash, pinned.manifestHash, 'the questions moved under the recording');
  for (const [i, want] of pinned.systems.entries()) {
    const got = report.systems[i];
    assert.equal(got.label, want.label);
    assert.equal(got.accuracy, want.accuracy, `${want.label}: accuracy`);
    assert.equal(Number(got.ece.toFixed(12)), Number(want.ece.toFixed(12)), `${want.label}: ECE`);
    assert.deepEqual(got.perDomain, want.perDomain, `${want.label}: per-domain`);
  }
  assert.equal(report.comparison.verdict, pinned.verdict);
  assert.equal(Number(report.comparison.mcnemar.p.toFixed(12)), Number(pinned.mcnemarP.toFixed(12)));
});
