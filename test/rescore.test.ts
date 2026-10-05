import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  PRIMING,
  REAL_MODEL,
  SUMMARY_PATH,
  TRANSCRIPT_PATH,
  generateQuestions,
  keyOf,
  loadTranscript,
  replayAsker,
  score
} from '../src/real.ts';
import type { Question, RealSummary, TranscriptEntry } from '../src/real.ts';
import { classify, finalAnswer, formatRescore, isTruncated, runRescore, scoreFinal } from '../src/rescore.ts';

const TRANSCRIPT_SHA256 = '762f627649e915d05fec6f1939973409cc5e77a235532d0d2d50699c93a6b4ff';
const SUMMARY_SHA256 = '5e846fcf38018cba4a2eabf43ebebacbd739fd45ae66841273313f726b20cae6';

const transcript = loadTranscript(TRANSCRIPT_PATH);
const questions = new Map(generateQuestions(100, 1).map((q) => [q.id, q]));

function recorded(arm: 'generalist' | 'routed', id: string): { q: Question; text: string } {
  const q = questions.get(id)!;
  const priming = arm === 'generalist' ? PRIMING.generalist : PRIMING[q.domain];
  return { q, text: transcript.get(keyOf(REAL_MODEL, priming, q.prompt))!.text };
}

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sig12 = (x: number) => Number(x.toPrecision(12));

test('a reply that works first and answers last is wrong on its first token and right on its final answer', () => {
  const ledger = recorded('routed', 'ledger-4');
  assert.match(ledger.text, /^Let me carefully identify/);
  assert.match(ledger.text, /753 \+ 633 = 1386\n\n1386\n\nCONFIDENCE: 0\.99$/);
  assert.equal(score(ledger.q, ledger.text, '').said, 'let');
  assert.equal(score(ledger.q, ledger.text, '').correct, false);
  assert.deepEqual(scoreFinal(ledger.q, ledger.text), { id: 'ledger-4', correct: true, truncated: false, said: '1386' });
  assert.equal(classify(ledger.q, ledger.text), 'opened with working');

  const network = recorded('generalist', 'network-9');
  assert.match(network.text, /^I need to trace/);
  assert.match(network.text, /There's no way to exit/, 'a "no" inside the working is not the answer');
  assert.equal(network.q.answer, 'no');
  assert.equal(score(network.q, network.text, '').correct, false);
  assert.equal(scoreFinal(network.q, network.text).correct, true);
  assert.equal(classify(network.q, network.text), 'opened with working');
});

test('every routed ledger reply the strict scorer marks wrong opened with working and ends on the right answer', () => {
  const missed = [...questions.values()]
    .filter((q) => q.domain === 'ledger')
    .map((q) => recorded('routed', q.id))
    .filter(({ q, text }) => !score(q, text, '').correct);
  assert.equal(missed.length, 23);
  for (const { q, text } of missed) {
    assert.equal(classify(q, text), 'opened with working', q.id);
    assert.equal(scoreFinal(q, text).correct, true, q.id);
  }
});

test('"No." keeps its full stop under the strict scorer and loses it under the final-answer scorer', () => {
  const { q, text } = recorded('routed', 'network-19');
  assert.equal(text, 'No.\n\nCONFIDENCE: 0.95');
  assert.equal(q.answer, 'no');
  assert.equal(score(q, text, '').said, 'no.');
  assert.equal(score(q, text, '').correct, false);
  assert.equal(scoreFinal(q, text).correct, true);
  assert.equal(classify(q, text), 'trailing punctuation');

  const yes = questions.get('network-17')!;
  assert.equal(yes.answer, 'yes');
  assert.equal(score(yes, 'Yes.\n\nCONFIDENCE: 0.9', '').correct, false);
  assert.equal(scoreFinal(yes, 'Yes.\n\nCONFIDENCE: 0.9').correct, true);
  assert.equal(classify(yes, 'Yes.\n\nCONFIDENCE: 0.9'), 'trailing punctuation');
});

test('no recorded reply opens with "Yes."; every full-stop opening is "No."', () => {
  const texts = [...transcript.values()].map((e) => e.text);
  assert.equal(texts.filter((t) => /^yes\./i.test(t)).length, 0);
  assert.equal(texts.filter((t) => /^no\./i.test(t)).length, 21);
});

test('a reply cut off before its CONFIDENCE line is wrong, even when its last number is the answer', () => {
  const cut = recorded('routed', 'timeline-6');
  assert.equal(isTruncated(cut.text), true);
  assert.deepEqual(scoreFinal(cut.q, cut.text), { id: 'timeline-6', correct: false, truncated: true, said: '30' });
  assert.equal(classify(cut.q, cut.text), 'truncated');

  const lucky = recorded('routed', 'timeline-52');
  assert.match(lucky.text, /\*\*Days apart:\*\* 209 - 107 = 102 days\n\n102$/);
  assert.equal(lucky.q.answer, '102');
  assert.equal(finalAnswer(lucky.text, 'number'), '102');
  assert.equal(scoreFinal(lucky.q, lucky.text).correct, false, 'a truncated reply is wrong whatever it last said');
  assert.equal(classify(lucky.q, lucky.text), 'truncated');
});

test('a finished reply with the wrong answer is wrong under both scorers', () => {
  const { q, text } = recorded('generalist', 'timeline-1');
  assert.equal(text, '58\n\nCONFIDENCE: 0.99');
  assert.equal(q.answer, '57');
  assert.equal(score(q, text, '').correct, false);
  assert.deepEqual(scoreFinal(q, text), { id: 'timeline-1', correct: false, truncated: false, said: '58' });
  assert.equal(classify(q, text), 'genuinely wrong answer');

  const right = recorded('generalist', 'ledger-0');
  assert.equal(right.text, '0\n\nCONFIDENCE: 0.95');
  assert.equal(classify(right.q, right.text), null, 'a reply both scorers mark right is not classified');
});

test('numbers: the last one stated, commas removed, and a date hyphen is not a minus sign', () => {
  assert.equal(finalAnswer('Total: 1,234\n\nCONFIDENCE: 0.9', 'number'), '1234');
  assert.equal(finalAnswer('12, 34 and then 56.\nCONFIDENCE: 0.9', 'number'), '56');
  assert.equal(finalAnswer('The outage was on 2025-03-15', 'number'), '15');
  assert.equal(finalAnswer('42\nCONFIDENCE: 0.9 and 77', 'number'), '42', 'nothing after CONFIDENCE is read');
  assert.equal(finalAnswer('no digits here', 'number'), null);
  const q = { ...questions.get('ledger-4')!, answer: '1234' };
  assert.equal(scoreFinal(q, '1,234\n\nCONFIDENCE: 0.9').correct, true);
  assert.equal(scoreFinal(q, '1234.5\n\nCONFIDENCE: 0.9').correct, false);
});

test('yes/no: only the standalone words count', () => {
  assert.equal(finalAnswer('I know nothing about it.\nCONFIDENCE: 0.5', 'yes-no'), null);
  assert.equal(finalAnswer('Nobody says yes; so: **NO**.\nCONFIDENCE: 0.5', 'yes-no'), 'no');
  assert.equal(finalAnswer('Yes!\nCONFIDENCE: 0.5', 'yes-no'), 'yes');
});

test('any other answer is an exact final token, never a substring', () => {
  const q: Question = { id: 'x', domain: 'ledger', prompt: '', answer: 'paris' };
  assert.equal(scoreFinal(q, 'The capital is Paris.\nCONFIDENCE: 0.9').correct, true);
  assert.equal(scoreFinal(q, 'Parisian\nCONFIDENCE: 0.9').correct, false);
  assert.equal(scoreFinal(q, 'paris-ish\nCONFIDENCE: 0.9').correct, false);
  assert.equal(scoreFinal(q, 'Paris, I think\nCONFIDENCE: 0.9').correct, false);
});

test('every reply without a CONFIDENCE line stopped at the 256-token limit', () => {
  const entries = readFileSync(TRANSCRIPT_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as TranscriptEntry);
  const cut = entries.filter((e) => isTruncated(e.text));
  assert.equal(cut.length, 27);
  assert.deepEqual([...new Set(cut.map((e) => e.usage?.output))], [256]);
  const late = entries.filter((e) => e.usage?.output === 256 && !isTruncated(e.text));
  assert.equal(late.length, 5, 'five more reached the limit inside their CONFIDENCE line');
  for (const e of late) assert.match(e.text, /\n\d+\n\nCONFIDENCE: [\d.]*$/, 'and stated an answer first');
});

test('on final answers, the questions only the generalist got right are the truncated routed replies the strict scorer also gave it', () => {
  const strictB: string[] = [];
  const finalB: string[] = [];
  for (const id of questions.keys()) {
    const g = recorded('generalist', id);
    const r = recorded('routed', id);
    if (score(g.q, g.text, '').correct && !score(r.q, r.text, '').correct && isTruncated(r.text)) strictB.push(id);
    if (scoreFinal(g.q, g.text).correct && !scoreFinal(r.q, r.text).correct) finalB.push(id);
  }
  assert.equal(finalB.length, 22);
  assert.deepEqual(finalB, strictB);
});

const PINNED = {
  n: 400,
  scorers: {
    strict: {
      correct: { generalist: 331, routed: 271 },
      perDomain: {
        ledger: { generalist: 100, routed: 77 },
        network: { generalist: 74, routed: 63 },
        timeline: { generalist: 74, routed: 32 },
        identity: { generalist: 83, routed: 99 }
      },
      b: 81,
      c: 21,
      p: 1.70986517427e-9,
      diffPp: -15,
      low: -19.75,
      high: -10.25,
      verdict: 'A better'
    },
    final: {
      correct: { generalist: 352, routed: 364 },
      perDomain: {
        ledger: { generalist: 100, routed: 100 },
        network: { generalist: 86, routed: 90 },
        timeline: { generalist: 74, routed: 74 },
        identity: { generalist: 92, routed: 100 }
      },
      b: 22,
      c: 34,
      p: 0.140895423598,
      diffPp: 3,
      low: -0.5,
      high: 6.75,
      verdict: 'no separable difference'
    }
  },
  strictMisses: {
    generalist: { 'opened with working': 9, 'trailing punctuation': 12, 'opened with a wrong answer': 0, truncated: 0, 'genuinely wrong answer': 48 },
    routed: { 'opened with working': 87, 'trailing punctuation': 6, 'opened with a wrong answer': 0, truncated: 27, 'genuinely wrong answer': 9 }
  },
  strictRightFinalWrong: { generalist: 0, routed: 0 },
  discordant: {
    strict: {
      b: { 'opened with working': 53, 'trailing punctuation': 6, 'opened with a wrong answer': 0, truncated: 22, 'genuinely wrong answer': 0 },
      c: { 'opened with working': 0, 'trailing punctuation': 12, 'opened with a wrong answer': 0, truncated: 0, 'genuinely wrong answer': 9 }
    },
    final: {
      b: { 'opened with working': 0, 'trailing punctuation': 0, 'opened with a wrong answer': 0, truncated: 22, 'genuinely wrong answer': 0 },
      c: { 'opened with working': 0, 'trailing punctuation': 0, 'opened with a wrong answer': 0, truncated: 0, 'genuinely wrong answer': 34 }
    }
  },
  truncated: { generalist: { replies: 0, endOnTheAnswer: 0 }, routed: { replies: 27, endOnTheAnswer: 3 } }
};

const PRINTED = [
  're-scoring the real-model arm (post hoc) - claude-haiku-4-5, 400 questions, replayed from the transcript (no network)',
  '',
  'strict: the first token of the reply, as registered. final answer: the last answer the reply states, chosen after seeing the replies.',
  '',
  'accuracy              strict              final answer',
  '  generalist          331/400  82.8%      352/400  88.0%',
  '  routed              271/400  67.8%      364/400  91.0%',
  '',
  'per domain, generalist / routed, of 100 each',
  '              strict        final answer',
  '  ledger      100 /  77     100 / 100',
  '  network      74 /  63      86 /  90',
  '  timeline     74 /  32      74 /  74',
  '  identity     83 /  99      92 / 100',
  '',
  'A = generalist, B = routed. exact McNemar: b = A right and B wrong, c = the reverse; B - A with 95% bootstrap interval',
  '  strict        b 81  c 21  p 1.71e-9  -15.0pp [-19.8, -10.3]  A better',
  '  final answer  b 22  c 34  p 0.1409   +3.0pp [-0.5, 6.8]  no separable difference',
  '',
  'why the strict scorer marked a reply wrong  generalist  routed  final-answer scorer',
  '  opened with working                                9      87  right',
  '  trailing punctuation                              12       6  right',
  '  opened with a wrong answer                         0       0  right',
  '  truncated                                          0      27  wrong',
  '  genuinely wrong answer                            48       9  wrong',
  '  total                                             69     129',
  'marked right by the strict scorer and wrong by the final-answer scorer: generalist 0, routed 0',
  '',
  'the losing reply on each discordant pair',
  '  strict b: the 81 routed replies where only the generalist was right: opened with working 53, trailing punctuation 6, truncated 22',
  '  strict c: the 21 generalist replies where only routed was right: trailing punctuation 12, genuinely wrong answer 9',
  '  final answer b: the 22 routed replies where only the generalist was right: truncated 22',
  '  final answer c: the 34 generalist replies where only routed was right: genuinely wrong answer 34',
  '',
  'truncated at the 256-token limit: generalist 0, routed 27; 3 of them end on the right answer and still count as wrong',
  '',
  'The final-answer rule was chosen after the data was seen. It shows what the strict scorer measured;',
  'it is not a new registered result, and the recorded verdict stays the strict one.'
].join('\n');

test('the re-score pins every number it prints', async () => {
  const report = await runRescore(replayAsker(transcript));
  const { model, perDomain, ...rest } = report;
  assert.equal(model, REAL_MODEL);
  assert.equal(perDomain, 100);
  for (const s of Object.values(rest.scorers)) s.p = sig12(s.p);
  assert.deepEqual(rest, PINNED);
  assert.equal(formatRescore(report), PRINTED);
});

test('the strict column is the recorded arm, number for number', async () => {
  const pinned = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RealSummary;
  const { strict } = (await runRescore(replayAsker(transcript))).scorers;
  assert.equal(strict.correct.generalist / 400, pinned.systems[0].accuracy);
  assert.equal(strict.correct.routed / 400, pinned.systems[1].accuracy);
  for (const [i, arm] of (['generalist', 'routed'] as const).entries()) {
    for (const [d, acc] of Object.entries(pinned.systems[i].perDomain)) {
      assert.equal(strict.perDomain[d as keyof typeof strict.perDomain][arm] / 100, acc, `${arm} ${d}`);
    }
  }
  assert.equal(strict.p, pinned.mcnemarP);
  assert.equal(strict.verdict, pinned.verdict);
});

test('the recorded transcript and summary are the pinned bytes, before and after a re-score', async () => {
  assert.equal(sha256(TRANSCRIPT_PATH), TRANSCRIPT_SHA256);
  assert.equal(sha256(SUMMARY_PATH), SUMMARY_SHA256);
  formatRescore(await runRescore(replayAsker(loadTranscript(TRANSCRIPT_PATH))));
  assert.equal(sha256(TRANSCRIPT_PATH), TRANSCRIPT_SHA256);
  assert.equal(sha256(SUMMARY_PATH), SUMMARY_SHA256);
});
