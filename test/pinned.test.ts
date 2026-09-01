/** The numbers the README publishes, pinned.
 *
 * The old suite asserted inequalities - accuracy above 0.75, ECE above 0.1 -
 * which a compareModels stub returning "B better" would satisfy just as well
 * as the real thing. A study whose published table is not enforced is a
 * screenshot. These tests pin the exact values at the reported seed, so any
 * change to the world, the models, the bars, the router's policy or the
 * calibration binning breaks the build instead of quietly restating the study
 * on different ground.
 *
 * Accuracies are exact rationals (k/n), so they are compared exactly. ECE is
 * a float reduction over 1,200 rows and is compared to 12 decimal places. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStudy } from '../src/study.ts';
import { runFailureArms } from '../src/arms.ts';

const SEED = 1;
const PER_DOMAIN = 300;

/** The exact table on the README. */
const PINNED = {
  manifestHash: '873629d33b7894e704831f68f349af298ece579095f5326420398aa3fd682ca9',
  n: 1200,
  systems: [
    { label: 'generalist only', accuracy: 868 / 1200, ece: 0.038941545847 },
    { label: 'careful-router routed', accuracy: 936 / 1200, ece: 0.114672926336 },
    { label: 'oracle routed', accuracy: 936 / 1200, ece: 0.114672926336 }
  ],
  perDomain: {
    'generalist only': { ledger: 225 / 300, network: 223 / 300, timeline: 208 / 300, identity: 212 / 300 },
    'careful-router routed': { ledger: 238 / 300, network: 241 / 300, timeline: 208 / 300, identity: 249 / 300 }
  },
  mcnemarP: 0.000147884714
} as const;

const to12 = (x: number) => Number(x.toFixed(12));

test('the frozen manifest is the one the study reports on', async () => {
  const r = await runStudy(SEED, PER_DOMAIN);
  assert.equal(
    r.manifestHash,
    PINNED.manifestHash,
    'the corpus or the bars moved: the study is no longer the one the README describes'
  );
  assert.equal(r.n, PINNED.n);
});

test('every published accuracy and ECE is exactly what the README prints', async () => {
  const r = await runStudy(SEED, PER_DOMAIN);
  assert.equal(r.systems.length, PINNED.systems.length);
  for (const [i, want] of PINNED.systems.entries()) {
    const got = r.systems[i];
    assert.equal(got.label, want.label);
    assert.equal(got.accuracy, want.accuracy, `${want.label}: accuracy`);
    assert.equal(to12(got.ece), want.ece, `${want.label}: ECE`);
  }
});

test('the per-domain table is pinned, so a lane cannot regress unnoticed', async () => {
  const r = await runStudy(SEED, PER_DOMAIN);
  for (const [label, want] of Object.entries(PINNED.perDomain)) {
    const got = r.systems.find((s) => s.label === label)!;
    assert.deepEqual(got.perDomain, want, `${label}: per-domain accuracy`);
  }
});

test('the significance test is pinned to its p-value, not to its verdict string', async () => {
  const r = await runStudy(SEED, PER_DOMAIN);
  // A stub returning { verdict: 'B better' } passes a verdict assertion. It
  // does not produce this p-value from these 1,200 paired outcomes.
  assert.equal(to12(r.c1.comparison.mcnemar.p), PINNED.mcnemarP);
  assert.equal(r.c1.comparison.verdict, 'B better');
  assert.ok(r.c1.confirmed);
});

test('the ledger chains the three runs and replays their arithmetic', async () => {
  const r = await runStudy(SEED, PER_DOMAIN);
  assert.equal(r.ledger.entries, 3, 'one entry per system');
  assert.ok(r.ledger.intact, `ledger chain broken: ${r.ledger.reason ?? ''}`);
  assert.ok(
    r.ledger.replayed,
    'the ledger was only chain-walked, not replayed: that says nothing about whether the numbers are the numbers the scores support'
  );
});

test('the failure arms hold: the toolkit can report a loss, a non-result and a hidden regression', () => {
  const arms = runFailureArms(SEED, PER_DOMAIN);
  assert.equal(arms.length, 3);
  for (const arm of arms) {
    assert.ok(arm.held, `${arm.arm} did not hold: ${arm.expectation}`);
  }

  const [misroute, hidden, marginal] = arms;

  // A: the eval must catch a registry that lied about capabilities
  assert.equal(misroute.verdict, 'A better');
  assert.ok(misroute.routedAccuracy < misroute.generalistAccuracy);

  // C: the aggregate improves while a lane is worse than the honest registry
  assert.equal(hidden.verdict, 'B better');
  assert.deepEqual(hidden.regressedDomains, ['ledger']);

  // B: a real but tiny edge must not be called a win at this sample size
  assert.equal(marginal.verdict, 'no separable difference');
});
