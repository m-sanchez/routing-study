/** The failure arms: worlds where the toolkit is supposed to say no.
 *
 * The main study shows the instruments fire on a world built to make them
 * fire. That is only half a demonstration - an instrument that always fires
 * measures nothing. Each arm below plants a defect or an absence and asserts
 * the check that ought to catch it does.
 *
 * Run: npm run arms
 */

import { runFailureArms } from '../src/arms.ts';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

console.log('failure arms (synthetic, seeded 1) - the toolkit is expected to refuse here\n');

for (const arm of runFailureArms(1, 300)) {
  console.log(`${arm.held ? '[HELD]' : '[BROKEN]'} ${arm.arm}`);
  console.log(`   premise:     ${arm.premise}`);
  console.log(
    `   measured:    generalist ${pct(arm.generalistAccuracy)} -> routed ${pct(arm.routedAccuracy)}, ` +
      `ab-significance says "${arm.verdict}"`
  );
  console.log(`   expectation: ${arm.expectation}`);
  if (arm.regressedDomains?.length) {
    console.log(
      `   regressed:   ${arm.regressedDomains.join(', ')} - worse than the honest registry, ` +
        `while the baseline comparison still reads as a win`
    );
  }
  console.log();
}

console.log(
  'Arm C is the one worth reading twice. Nothing in it is broken: the router\n' +
    'obeys its policy, the eval computes correctly, and the headline comparison\n' +
    'reports a genuine improvement over the baseline. A lane is still quietly\n' +
    'worse than it should be, and no number the study would normally print says so.'
);
