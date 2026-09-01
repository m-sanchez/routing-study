/** Failure arms: worlds where the toolkit is supposed to say NO.
 *
 * The main study runs a world built to exhibit a real trade, and the toolkit
 * reports it. That only shows the instruments fire; it does not show they can
 * stay silent. A study whose checks pass on every world it is given is not
 * measuring anything. These arms are the negative controls - each one plants a
 * defect or an absence, and the check that ought to catch it is asserted to
 * catch it.
 *
 * Arm A (misroute): a specialist over-declares its capabilities AND is priced
 * strictly cheapest, so the router sends every domain to a model that is only
 * good at one of them. Nothing in the router is broken - the registry lied -
 * and the accuracy eval has to notice the result.
 *
 * Arm B (marginal): the specialists are barely better than the generalist. The
 * accuracy difference is real but small, and at this sample size McNemar
 * should REFUSE to call it - the arm exists to prove the study is capable of
 * reporting "not separable from noise" rather than always confirming a win.
 *
 * Arm C (hidden regression) is the interesting one, and it was not designed -
 * it fell out of getting arm A wrong first. Over-declaring costs ledger-spec
 * its OWN lane: four capabilities make it read as a generalist, it is priced
 * as one, and it then loses the ledger tie-break to generalist-v1. Ledger
 * accuracy drops 79.3% -> 75.0% against the correctly-declared registry.
 * Measured against the generalist baseline, though, the run still looks like
 * a clean win (72.3% -> 76.9%, McNemar "B better"), because the two lanes
 * that still work more than pay for the one that broke. The number is not
 * wrong; it is answering a question nobody asked. Catching this needs the
 * comparison the study would not otherwise run - routed-with-the-lie against
 * routed-without-it - which is the same lesson the calibration bar teaches on
 * the main world: an aggregate that improves can still be hiding a regression. */

import { compareModels } from '@m-sanchez/ab-significance';
import { generalist, specialist } from './models.ts';
import type { Model } from './models.ts';
import { runGeneralist, runRouted } from './systems.ts';
import type { Scored } from './systems.ts';
import { DOMAINS, generateCorpus } from './world.ts';

export interface ArmResult {
  arm: string;
  premise: string;
  generalistAccuracy: number;
  routedAccuracy: number;
  verdict: ReturnType<typeof compareModels>['verdict'];
  /** what the arm is asserting the toolkit does on this world */
  expectation: string;
  held: boolean;
  /** arm C only: lanes worse than the honest registry produces */
  regressedDomains?: string[];
}

const accuracyOf = (scored: Scored[]) =>
  scored.filter((s) => s.correct).length / (scored.length || 1);

const outcomes = (scored: Scored[]) => scored.map((s) => ({ id: s.id, correct: s.correct }));

/** Arm A: ledger-spec declares every domain, so it is the cheapest qualifying
 * model everywhere and answers questions it was never trained on. */
export function misrouteModels(): Model[] {
  const over = specialist('ledger-spec', 'ledger', 0.9, 0.45);
  return [
    generalist('generalist-v1', 0.8),
    { ...over, capabilities: [...DOMAINS], price: { inMicros: 500_000, outMicros: 2_500_000 } },
    specialist('network-spec', 'network', 0.9, 0.45),
    specialist('identity-spec', 'identity', 0.9, 0.45)
  ];
}

/** Arm C: the same lie, but only tied on price rather than strictly cheapest.
 * The router then splits: ledger-spec takes network and timeline on the
 * tie-break, identity-spec keeps identity. */
export function tiedMisrouteModels(): Model[] {
  const over = specialist('ledger-spec', 'ledger', 0.9, 0.45);
  return [
    generalist('generalist-v1', 0.8),
    { ...over, capabilities: [...DOMAINS] },
    specialist('network-spec', 'network', 0.9, 0.45),
    specialist('identity-spec', 'identity', 0.9, 0.45)
  ];
}

/** The correctly-declared registry, i.e. what the main study routes with. */
export function honestModels(): Model[] {
  return [
    generalist('generalist-v1', 0.8),
    specialist('ledger-spec', 'ledger', 0.9, 0.45),
    specialist('network-spec', 'network', 0.9, 0.45),
    specialist('identity-spec', 'identity', 0.9, 0.45)
  ];
}

/** Arm B: specialists that are only just ahead of the generalist. */
export function marginalModels(): Model[] {
  return [
    generalist('generalist-v1', 0.8),
    specialist('ledger-spec', 'ledger', 0.82, 0.45),
    specialist('network-spec', 'network', 0.82, 0.45),
    specialist('identity-spec', 'identity', 0.82, 0.45)
  ];
}

export function runArm(
  arm: string,
  premise: string,
  expectation: string,
  models: Model[],
  seed: number,
  perDomain: number,
  holds: (r: { g: Scored[]; routed: Scored[]; verdict: string }) => boolean
): ArmResult {
  const corpus = generateCorpus(perDomain, seed);
  const g = runGeneralist(models[0], corpus);
  const routed = runRouted(models, corpus);
  const comparison = compareModels(outcomes(g), outcomes(routed), { minEffectPct: 2 });
  return {
    arm,
    premise,
    generalistAccuracy: accuracyOf(g),
    routedAccuracy: accuracyOf(routed),
    verdict: comparison.verdict,
    expectation,
    held: holds({ g, routed, verdict: comparison.verdict })
  };
}

const domainAccuracy = (rows: Scored[], d: string) => {
  const inDomain = rows.filter((s) => s.domain === d);
  return inDomain.filter((s) => s.correct).length / (inDomain.length || 1);
};

/** Arm C needs a comparison the study does not otherwise make: the lying
 * registry against the honest one, rather than either against the baseline. */
function hiddenRegressionArm(seed: number, perDomain: number): ArmResult {
  const corpus = generateCorpus(perDomain, seed);
  const honest = runRouted(honestModels(), corpus);
  const lying = runRouted(tiedMisrouteModels(), corpus);
  const g = runGeneralist(honestModels()[0], corpus);
  const comparison = compareModels(outcomes(g), outcomes(lying), { minEffectPct: 2 });
  const regressed = DOMAINS.filter((d) => domainAccuracy(lying, d) < domainAccuracy(honest, d));
  return {
    arm: 'C: regression hidden behind an improving aggregate',
    premise:
      'over-declaring costs ledger-spec its own lane (it is priced as a generalist and loses the tie-break)',
    generalistAccuracy: accuracyOf(g),
    routedAccuracy: accuracyOf(lying),
    verdict: comparison.verdict,
    expectation:
      'against the baseline this still reads "B better"; only routed-vs-routed shows the regressed lane',
    // the arm holds by DEMONSTRATING the blind spot: the baseline comparison
    // says win, and a lane is nonetheless worse than the honest registry gives
    held: comparison.verdict === 'B better' && regressed.length > 0,
    regressedDomains: regressed
  };
}

export function runFailureArms(seed = 1, perDomain = 300): ArmResult[] {
  return [
    runArm(
      'A: capability over-declaration',
      'ledger-spec declares every domain, so the router sends all four to it',
      'routing must not beat the generalist here: the accuracy eval has to catch the misroute',
      misrouteModels(),
      seed,
      perDomain,
      ({ verdict }) => verdict !== 'B better'
    ),
    hiddenRegressionArm(seed, perDomain),
    runArm(
      'B: marginal specialists',
      'specialists are 0.82 against the generalist 0.80 - a real but tiny edge',
      'McNemar must refuse to call this a win at this sample size',
      marginalModels(),
      seed,
      perDomain,
      ({ verdict }) => verdict !== 'B better'
    )
  ];
}
