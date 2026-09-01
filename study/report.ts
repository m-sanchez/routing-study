/** npm run study: run the whole thing and print the report. Seeded and
 * reproducible; the numbers in the README come from this. */

import { runStudy } from '../src/study.ts';

const report = await runStudy(1, 300);

console.log(`routing study - ${report.n} examples over 4 domains, seed ${report.seed}\n`);

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
  const tag = d === report.h2.unspecialised ? '  (no specialist)' : '';
  console.log(`  ${d.padEnd(10)} ${(g * 100).toFixed(1)}% -> ${(r * 100).toFixed(1)}%${tag}`);
}

console.log('\nhypotheses declared before the run:');
line('H1', report.h1.statement, report.h1.held);
console.log(`     ${report.h1.comparison.statement}`);
line('H2', report.h2.statement, report.h2.held);
console.log(
  `     ${report.h2.unspecialised}: ${(report.h2.generalistAcc * 100).toFixed(1)}% -> ${(report.h2.routedAcc * 100).toFixed(1)}%`
);
line('H3', report.h3.statement, report.h3.held);
console.log(
  `     cleared accuracy bar: ${report.h3.clearedAccuracy}, failed calibration bar: ${report.h3.failedCalibration}`
);

function line(id: string, statement: string, held: boolean) {
  console.log(`\n  [${held ? 'HELD' : 'NOT HELD'}] ${id}: ${statement}`);
}
