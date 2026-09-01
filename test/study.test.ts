import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStudy, buildModels } from '../src/study.ts';
import { runRouted, runOracle } from '../src/systems.ts';
import { generateCorpus } from '../src/world.ts';

test('the study is reproducible: the same seed gives the same accuracies', async () => {
  const a = await runStudy(1, 100);
  const b = await runStudy(1, 100);
  assert.deepEqual(
    a.systems.map((s) => s.accuracy),
    b.systems.map((s) => s.accuracy)
  );
});

test('careful-router matches the oracle when capabilities are declared correctly', () => {
  const models = buildModels();
  const corpus = generateCorpus(150, 2);
  const routed = runRouted(models, corpus);
  const oracle = runOracle(models, corpus);
  assert.deepEqual(
    routed.map((s) => s.routedTo),
    oracle.map((s) => s.routedTo),
    'the router dispatches every example to the model the oracle would'
  );
});

test('each domain routes to its specialist, and the unspecialised one to the generalist', () => {
  const models = buildModels();
  const corpus = generateCorpus(20, 3);
  const routed = runRouted(models, corpus);
  const byDomain = new Map<string, Set<string>>();
  for (const s of routed) {
    if (!byDomain.has(s.domain)) byDomain.set(s.domain, new Set());
    byDomain.get(s.domain)!.add(s.routedTo);
  }
  assert.deepEqual([...byDomain.get('ledger')!], ['ledger-spec']);
  assert.deepEqual([...byDomain.get('identity')!], ['identity-spec']);
  assert.deepEqual([...byDomain.get('timeline')!], ['generalist-v1'], 'no specialist -> generalist');
});

test('the toolkit detects the planted trade at the reported seed', async () => {
  const report = await runStudy(1, 300);

  // C1: ab-significance confirms the accuracy win is separable from noise
  assert.ok(report.c1.confirmed, 'routing beats the generalist beyond noise');
  assert.equal(report.c1.comparison.verdict, 'B better');

  // C3: calibrated + frozen-eval catch the planted overconfidence
  assert.ok(report.c3.confirmed, 'accurate but overconfident');
  const routed = report.systems.find((s) => s.label === 'careful-router routed')!;
  assert.ok(routed.accuracy > 0.75, 'clears the accuracy bar');
  assert.ok(routed.ece > 0.1, 'fails the calibration bar');

  // the generalist is the mirror image: honest but not accurate enough
  const gen = report.systems[0];
  assert.ok(gen.accuracy < 0.75 && gen.ece < 0.1, 'honest but below the ship bar');
});

test('the dispatch invariant is exact, not approximate: identical by construction', async () => {
  const report = await runStudy(1, 300);
  // routing sends the unspecialised domain to the same generalist, so the
  // outcomes are byte-identical - this is a correctness invariant that
  // cannot fail, deliberately not framed as an empirical hypothesis
  assert.equal(report.invariant.generalistAcc, report.invariant.routedAcc);
  assert.ok(report.invariant.identical);
});
