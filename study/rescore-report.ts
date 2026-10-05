import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SUMMARY_PATH, TRANSCRIPT_PATH, loadTranscript, replayAsker } from '../src/real.ts';
import type { RealSummary } from '../src/real.ts';
import { formatRescore, runRescore } from '../src/rescore.ts';

const pinned = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as RealSummary;
if (createHash('sha256').update(readFileSync(TRANSCRIPT_PATH)).digest('hex') !== pinned.transcriptSha256) {
  console.error(`${TRANSCRIPT_PATH} does not hash to the pinned summary; refusing to re-score an edited transcript.`);
  process.exit(2);
}

const report = await runRescore(replayAsker(loadTranscript()), { seed: pinned.seed, perDomain: pinned.perDomain });
console.log(formatRescore(report));
