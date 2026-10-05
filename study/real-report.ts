/** npm run real            replay the recorded transcript, print the report
 *  npm run real -- --live   ask the model for anything the transcript lacks,
 *                           append the answers, then print and pin the summary
 *  --per-domain N           questions per domain (default 100; 400 in all)
 *  --seed N                 corpus seed (default 1)
 *
 * Live mode needs a credential (ANTHROPIC_API_KEY, or an `ant auth login`
 * profile) and spends money - at haiku pricing a full 400-question run is
 * well under a dollar. It is refused under CI. */

import { existsSync, readFileSync } from 'node:fs';
import {
  REAL_MODEL,
  SUMMARY_PATH,
  TRANSCRIPT_PATH,
  liveAsker,
  loadTranscript,
  replayAsker,
  runReal,
  summarise,
  writeSummary
} from '../src/real.ts';
import type { RealSummary } from '../src/real.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const live = args.includes('--live');
const perDomain = flag('--per-domain', 100);
const seed = flag('--seed', 1);

const transcript = loadTranscript();
if (!live && transcript.size === 0) {
  console.error(
    `no transcript at ${TRANSCRIPT_PATH}. This arm has not been recorded yet.\n` +
      `Record it (spends money, needs a credential): npm run real -- --live`
  );
  process.exit(2);
}

const recorder = live ? await liveAsker(transcript) : replayAsker(transcript);
const report = await runReal({ seed, perDomain, recorder, mode: live ? 'live' : 'replay' });

console.log(
  `real-model arm - ${report.model}, seed ${report.seed}, ${report.n} questions over 4 domains ` +
    `(${report.mode}${report.mode === 'live' ? `, ${report.liveCalls} live calls` : ', no network'})\n`
);
console.log('system                          accuracy   ECE     accuracy bar   calibration bar');
for (const s of report.systems) {
  const bar = (m: string) => (s.verdict.results.find((r) => r.metric === m)!.pass ? 'PASS' : 'FAIL');
  console.log(
    `${s.label.padEnd(31)} ${`${(s.accuracy * 100).toFixed(1)}%`.padEnd(10)} ${s.ece.toFixed(3)}   ${bar('accuracy').padEnd(14)} ${bar('ece')}`
  );
}

console.log('\nper-domain accuracy (generalist priming -> routed priming):');
for (const d of Object.keys(report.systems[0].perDomain)) {
  const g = report.systems[0].perDomain[d];
  const r = report.systems[1].perDomain[d];
  const delta = (r - g) * 100;
  console.log(`  ${d.padEnd(10)} ${(g * 100).toFixed(1)}% -> ${(r * 100).toFixed(1)}%  (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp)`);
}

console.log(`\nab-significance, strict first-token scoring as registered: ${report.comparison.statement}`);
console.log(
  `frozen-eval: manifest ${report.manifestHash.slice(0, 12)}…, ledger ${report.ledger.entries} entries, ` +
    `chain ${report.ledger.intact ? 'intact' : 'BROKEN'}, arithmetic ${report.ledger.replayed ? 'replayed' : 'not replayed'}`
);

const pinned = existsSync(SUMMARY_PATH) ? (JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RealSummary) : undefined;
const summary = summarise(report, live ? new Date().toISOString() : (pinned?.recordedAt ?? 'not pinned'), TRANSCRIPT_PATH);
// a replay made no calls; the count that matters is the one the recording made
const liveCalls = !live && pinned ? pinned.liveCalls : summary.liveCalls;

console.log('\nprovenance:');
console.log(`  model            ${summary.model}`);
console.log(`  recorded at      ${summary.recordedAt}`);
console.log(`  seed             ${summary.seed}`);
console.log(`  per domain       ${summary.perDomain} (n = ${report.n})`);
console.log(`  live calls       ${liveCalls}`);
console.log(`  tokens in / out  ${summary.usage.input} / ${summary.usage.output}`);
console.log(`  transcript       sha256 ${summary.transcriptSha256.slice(0, 12)}`);
console.log(`  mode             ${report.mode}${report.mode === 'replay' ? ' (no network)' : ''}`);

console.log(
  "\nThis is one model, one prompt set, one day. It says how this model's replies\n" +
    'scored under the registered first-token scorer, and whether the toolkit\n' +
    'reported that honestly. It does not settle whether routing helped: npm run\n' +
    'rescore scores the same replies on their final answers (post hoc). It is not\n' +
    'evidence about routing in general.'
);

if (live && report.liveCalls === 0 && pinned) {
  console.log(`\nthe transcript already covered every question; nothing was recorded and the pin at ${SUMMARY_PATH} stands.`);
} else if (live) {
  writeSummary(summary);
  console.log(`\nsummary pinned at ${SUMMARY_PATH}${existsSync(SUMMARY_PATH) ? '' : ' (write failed)'}`);
  console.log('commit study/transcripts/ so CI can replay this run without a credential.');
}
