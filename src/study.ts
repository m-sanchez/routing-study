/** A DEMONSTRATION, not a discovery. The synthetic world is designed with
 * a known trade planted in it: specialists that are accurate on their
 * domain but overconfident everywhere. The study's job is to show that the
 * toolkit MEASURES that trade correctly - frozen-eval holds the bars,
 * ab-significance tests whether the accuracy win is real (rather than
 * reading a planted +10pp credulously), and calibrated catches the
 * overconfidence a naive accuracy eval would ship. The value is the
 * methodology surfacing what an accuracy number hides, on a world where we
 * know the ground truth; it is not evidence about real models. */

import { compareModels } from '@m-sanchez/ab-significance';
import type { Outcome } from '@m-sanchez/ab-significance';
import { calibrationError } from '@m-sanchez/calibrated';
import { evaluateBars, freeze, runEval } from '@m-sanchez/frozen-eval';
import type { Bar, Corpus } from '@m-sanchez/frozen-eval';
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

/** What the toolkit is asked to detect on this designed world. These are
 * not open empirical questions - the world was built to exhibit them - so
 * they are framed as "does the measurement confirm the planted property?".
 * The claim of the study is that the tooling reports them correctly, not
 * that they were unknown. */
export const CHECKS = {
  C1: 'ab-significance confirms routing beats the generalist beyond sampling noise (the planted +accuracy is real, not credulously read)',
  C3: 'calibrated + frozen-eval catch the planted overconfidence: the routed system clears the accuracy bar but fails the calibration bar'
} as const;

/** An INVARIANT, not a hypothesis. Routing dispatches the unspecialised
 * domain to the same generalist the baseline uses, so its outcomes are
 * identical by construction. This is verified as a dispatch-correctness
 * property; it cannot fail, and is not presented as a finding. */
export const INVARIANT =
  'routing leaves the unspecialised domain byte-identical to the baseline (dispatch correctness)';

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
  c1: { statement: string; comparison: ReturnType<typeof compareModels>; confirmed: boolean };
  invariant: { statement: string; unspecialised: string; generalistAcc: number; routedAcc: number; identical: boolean };
  c3: { statement: string; clearedAccuracy: boolean; failedCalibration: boolean; confirmed: boolean };
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

  // C1: does ab-significance confirm routing's win is separable from noise?
  const comparison = compareModels(outcomes(g), outcomes(routed), { minEffectPct: 2 });
  const c1Confirmed = comparison.verdict === 'B better';

  // Invariant: the unspecialised domain is routed to the generalist, so its
  // outcomes are identical to the baseline. Verified, not hypothesised.
  const unspecialised = DOMAINS.find((d) => !SPECIALISED.includes(d))!;
  const gDom = perDomainAccuracy(g)[unspecialised];
  const rDom = perDomainAccuracy(routed)[unspecialised];
  const identical = rDom === gDom;

  // C3: do calibrated + frozen-eval catch the planted overconfidence?
  const routedSystem = systems[1];
  const clearedAccuracy = routedSystem.verdict.results.find((r) => r.metric === 'accuracy')!.pass;
  const failedCalibration = !routedSystem.verdict.results.find((r) => r.metric === 'ece')!.pass;

  return {
    seed,
    n: corpus.length,
    systems,
    c1: { statement: CHECKS.C1, comparison, confirmed: c1Confirmed },
    invariant: { statement: INVARIANT, unspecialised, generalistAcc: gDom, routedAcc: rDom, identical },
    c3: { statement: CHECKS.C3, clearedAccuracy, failedCalibration, confirmed: clearedAccuracy && failedCalibration }
  };
}
