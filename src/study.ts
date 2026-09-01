/** The study itself: hypotheses declared before results, then measured
 * with the toolkit. frozen-eval holds the accuracy bars, calibrated
 * measures whether the confidence is honest, and ab-significance decides
 * whether routing's win is real or noise. The verdict on each hypothesis
 * is whatever the numbers say - including the ones that fail. */

import { compareModels } from 'ab-significance';
import type { Outcome } from 'ab-significance';
import { calibrationError } from 'calibrated';
import { evaluateBars, freeze, runEval } from 'frozen-eval';
import type { Bar, Corpus } from 'frozen-eval';
import { generalist, specialist } from './models.ts';
import type { Model } from './models.ts';
import { runGeneralist, runOracle, runRouted } from './systems.ts';
import type { Scored } from './systems.ts';
import { DOMAINS, SPECIALISED, generateCorpus } from './world.ts';
import type { Example } from './world.ts';

/** Declared BEFORE any run: the accuracy bar a shippable system must clear,
 * and the calibration bar its confidence must clear to be trusted. */
export const BARS: Bar[] = [
  { metric: 'accuracy', op: '>=', value: 0.75, note: 'a routed system must beat this to ship' },
  { metric: 'ece', op: '<=', value: 0.1, note: 'confidence must be honest enough to act on' }
];

/** Declared before results: what we expect routing to do. */
export const HYPOTHESES = {
  H1: 'the routed system is more accurate than the generalist alone, beyond sampling noise',
  H2: 'routing does not hurt the unspecialised domain (no cross-task interference)',
  H3: 'the routed system is overconfident: it clears the accuracy bar but fails the calibration bar'
} as const;

export function buildModels(): Model[] {
  return [
    generalist('generalist-v1', 0.80),
    specialist('ledger-spec', 'ledger', 0.90, 0.45),
    specialist('network-spec', 'network', 0.90, 0.45),
    specialist('identity-spec', 'identity', 0.90, 0.45)
    // note: no timeline specialist, on purpose (the interference check)
  ];
}

const toCorpus = (examples: Example[]): Corpus => ({
  all: examples.map((e) => ({ id: e.id, input: e.domain, expected: null }))
});

const outcomes = (scored: Scored[]): Outcome[] =>
  scored.map((s) => ({ id: s.id, correct: s.correct }));

const accuracyOf = (scored: Scored[]) =>
  scored.filter((s) => s.correct).length / (scored.length || 1);

const perDomainAccuracy = (scored: Scored[]) => {
  const out: Record<string, number> = {};
  for (const d of DOMAINS) {
    const rows = scored.filter((s) => s.domain === d);
    out[d] = rows.filter((s) => s.correct).length / (rows.length || 1);
  }
  return out;
};

export interface SystemResult {
  label: string;
  accuracy: number;
  ece: number;
  verdict: ReturnType<typeof evaluateBars>;
  perDomain: Record<string, number>;
}

export interface StudyReport {
  seed: number;
  n: number;
  systems: SystemResult[];
  h1: { statement: string; comparison: ReturnType<typeof compareModels>; held: boolean };
  h2: { statement: string; unspecialised: string; generalistAcc: number; routedAcc: number; held: boolean };
  h3: { statement: string; clearedAccuracy: boolean; failedCalibration: boolean; held: boolean };
}

export async function runStudy(seed = 1, perDomain = 300): Promise<StudyReport> {
  const models = buildModels();
  const corpus = generateCorpus(perDomain, seed);
  const manifest = freeze(toCorpus(corpus), BARS);

  const g = runGeneralist(models[0], corpus);
  const routed = runRouted(models, corpus);
  const oracle = runOracle(models, corpus);

  const systems: SystemResult[] = [];
  for (const [label, scored] of [
    ['generalist only', g],
    ['careful-router routed', routed],
    ['oracle routed', oracle]
  ] as const) {
    const byId = new Map(scored.map((s) => [s.id, s]));
    const run = await runEval({
      manifest,
      corpus: toCorpus(corpus),
      split: 'all',
      label,
      judge: (item) => ({ accuracy: byId.get(item.id)!.correct })
    });
    const ece = calibrationError(
      scored.map((s) => ({ confidence: s.confidence, correct: s.correct })),
      15
    ).ece;
    const verdict = evaluateBars({ ...run.aggregate, ece: { kind: 'mean', value: ece, n: scored.length } }, BARS);
    systems.push({ label, accuracy: accuracyOf(scored), ece, verdict, perDomain: perDomainAccuracy(scored) });
  }

  // H1: routed vs generalist, is the improvement separable from noise?
  const comparison = compareModels(outcomes(g), outcomes(routed), { minEffectPct: 2 });
  const h1Held = comparison.verdict === 'B better';

  // H2: the unspecialised domain must not be worse under routing
  const unspecialised = DOMAINS.find((d) => !SPECIALISED.includes(d))!;
  const gDom = perDomainAccuracy(g)[unspecialised];
  const rDom = perDomainAccuracy(routed)[unspecialised];
  const h2Held = rDom >= gDom - 0.02; // no meaningful regression

  // H3: routed clears accuracy but fails calibration
  const routedSystem = systems[1];
  const clearedAccuracy = routedSystem.verdict.results.find((r) => r.metric === 'accuracy')!.pass;
  const failedCalibration = !routedSystem.verdict.results.find((r) => r.metric === 'ece')!.pass;

  return {
    seed,
    n: corpus.length,
    systems,
    h1: { statement: HYPOTHESES.H1, comparison, held: h1Held },
    h2: { statement: HYPOTHESES.H2, unspecialised, generalistAcc: gDom, routedAcc: rDom, held: h2Held },
    h3: { statement: HYPOTHESES.H3, clearedAccuracy, failedCalibration, held: clearedAccuracy && failedCalibration }
  };
}
