/** npm run study: run the whole thing and print the report. Seeded and
 * reproducible; the numbers in the README come from this.
 *
 * This is a demonstration on a designed synthetic world - the trade it
 * surfaces was planted - so it reports "checks the toolkit confirms" and a
 * verified dispatch invariant, not empirical discoveries. */

import { runStudy } from '../src/study.ts';

const report = await runStudy(1, 300);

console.log(`routing study (synthetic, seeded ${report.seed}) - ${report.n} examples over 4 domains\n`);

console.log('system                   accuracy   ECE     accuracy bar   calibration bar');
for (const s of report.systems) {
  const accBar = s.verdict.results.find((r) => r.metric === 'accuracy')!.pass ? 'PASS' : 'FAIL';
  const eceBar = s.verdict.results.find((r) => r.metric === 'ece')!.pass ? 'PASS' : 'FAIL';
  const acc = `${(s.accuracy * 100).toFixed(1)}%`;
  console.log(
    `${s.label.padEnd(24)} ${acc.padEnd(10)} ${s.ece.toFixed(3)}   ${accBar.padEnd(14)} ${eceBar}`
  );
}

console.log('\nper-domain accuracy (generalist -> routed):');
for (const d of Object.keys(report.systems[0].perDomain)) {
  const g = report.systems[0].perDomain[d];
  const r = report.systems[1].perDomain[d];
  const tag = d === report.invariant.unspecialised ? '  (no specialist)' : '';
  console.log(`  ${d.padEnd(10)} ${(g * 100).toFixed(1)}% -> ${(r * 100).toFixed(1)}%${tag}`);
}

console.log('\nwhat the toolkit was asked to detect on this designed world:');
check('C1', report.c1.statement, report.c1.confirmed);
console.log(`     ${report.c1.comparison.statement}`);
check('C3', report.c3.statement, report.c3.confirmed);
console.log(
  `     cleared accuracy bar: ${report.c3.clearedAccuracy}, failed calibration bar: ${report.c3.failedCalibration}`
);

console.log('\ndispatch invariant (verified, not a finding):');
console.log(`  [${report.invariant.identical ? 'VERIFIED' : 'BROKEN'}] ${report.invariant.statement}`);
console.log(
  `     ${report.invariant.unspecialised}: ${(report.invariant.generalistAcc * 100).toFixed(1)}% and ${(report.invariant.routedAcc * 100).toFixed(1)}% are identical by construction`
);

function check(id: string, statement: string, confirmed: boolean) {
  console.log(`\n  [${confirmed ? 'CONFIRMED' : 'NOT CONFIRMED'}] ${id}: ${statement}`);
}
