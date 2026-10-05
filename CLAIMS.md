# CLAIMS

Every externally falsifiable claim this study makes on its README, mapped to
the executable check that enforces it. A published number with no enforcing
test is a screenshot; if a row here has no test, the sentence should come out
of the README rather than stay on trust.

Run them with `npm test`. The reported tables are additionally reproducible
with `npm run study`, `npm run arms`, `npm run power` and `npm run rescore`.

## The headline table

| Claim | Enforced by |
| :-- | :-- |
| The study runs 1,200 examples over 4 domains at seed 1 | `test/pinned.test.ts::the frozen manifest is the one the study reports on` |
| The corpus and bars are the ones the README describes (manifest hash `873629d3…`) | `test/pinned.test.ts::the frozen manifest is the one the study reports on` |
| generalist accuracy 72.3%, ECE 0.0389 | `test/pinned.test.ts::every published accuracy and ECE is exactly what the README prints` |
| routed accuracy 78.0%, ECE 0.1147 | `test/pinned.test.ts::every published accuracy and ECE is exactly what the README prints` |
| oracle routed matches careful-router routed exactly | `test/pinned.test.ts::every published accuracy and ECE is exactly what the README prints`; `test/study.test.ts::careful-router matches the oracle when capabilities are declared correctly` |
| The per-domain table (ledger 75.0→79.3, network 74.3→80.3, timeline 69.3→69.3, identity 70.7→83.0) | `test/pinned.test.ts::the per-domain table is pinned, so a lane cannot regress unnoticed` |
| McNemar p = 0.000147884714, verdict "B better" | `test/pinned.test.ts::the significance test is pinned to its p-value, not to its verdict string` |
| The routed system clears the accuracy bar and fails the calibration bar | `test/study.test.ts::the toolkit detects the planted trade at the reported seed` |
| Routing leaves the unspecialised domain byte-identical to the baseline | `test/study.test.ts::the dispatch invariant is exact, not approximate: identical by construction` |

## The failure arms

| Claim | Enforced by |
| :-- | :-- |
| Arm A: an over-declaring, cheapest-priced registry collapses routing to 45.2% and ab-significance reports "A better" | `test/pinned.test.ts::the failure arms hold: the toolkit can report a loss, a non-result and a hidden regression` |
| Arm B: specialists at 0.82 vs a generalist at 0.80 produce "no separable difference" | same test |
| Arm C: the tied-price over-declaration still reads "B better" against the baseline while the ledger lane regresses | same test (asserts `verdict === 'B better'` **and** `regressedDomains === ['ledger']`) |
| All three arms hold at the reported seed | same test |

## How the toolkit is used

| Claim | Enforced by |
| :-- | :-- |
| The corpus is verified against the manifest it was frozen under before anything is scored | `src/study.ts` throws on mismatch; exercised by every test that calls `runStudy` |
| The calibration bar is gated on a metric produced inside the freeze (frozen-eval's corpus judge), not spliced in afterwards | `test/pinned.test.ts::every published accuracy and ECE is exactly what the README prints` reads `ece` off the frozen aggregate |
| Per-item confidence is recorded, so ECE is recomputable from the record alone | `test/pinned.test.ts::the ledger chains the three runs and replays their arithmetic` (replay recomputes ECE from each entry's own scores) |
| The three runs are written to a hash-chained ledger | same test (`ledger.entries === 3`, `intact`) |
| The ledger is replayed, not merely chain-walked | same test (asserts `replayed`) |
| The four tools are real dependencies that install and compose | `.github/workflows/test.yml` installs them from the registry and runs the suite |

## The real-model arm

| Claim | Enforced by |
| :-- | :-- |
| Every generated question has one checkable answer (a number or yes/no) and the same seed regenerates the same questions | `test/real.test.ts::every generated question has one checkable answer and a stable id` |
| The registry is valid for careful-router and routing dispatches each domain to its primed instance | `test/real.test.ts::the registry is valid and routes every domain to its primed instance` |
| Numeric answers compare numerically; a missing or out-of-range confidence statement reads as 0.5, never as certainty | `test/real.test.ts::scoring compares numbers numerically and words exactly, and reads the stated confidence` |
| The corpus is verified against its manifest, both runs enter a hash-chained ledger, and the ledger is replayed (arithmetic recomputed) | `test/real.test.ts::the composition holds: verified manifest, replayed ledger, an honest verdict` |
| A replay run never falls back to a live call: an uncovered question is an error | `test/real.test.ts::replay never guesses: a question the transcript does not cover is an error` |
| Live mode is refused under CI, before any credential is consulted | `test/real.test.ts::live mode is refused under CI before any credential is looked at` |
| The pinned summary carries the sha256 of the transcript file, the live-call count and the token usage, and one changed byte changes the hash | `test/real.test.ts::the summary pins the transcript bytes` |
| A recorded run replays to exactly its pinned summary (manifest hash, every accuracy/ECE, per-domain table, verdict, p-value), the committed transcript hashes to the pinned sha256, and the pin records at least one live call | `test/real.test.ts::a recorded run replays to exactly its pinned summary` |
| Every number the README prints for the recorded arm - the two accuracies and ECEs, the per-domain table, the verdict and the p-value - is the one a replay of the committed transcript produces | `test/real.test.ts::a recorded run replays to exactly its pinned summary` |
| The live-call count and token spend in the provenance block add up from the committed transcript, and no key was recorded twice | `test/real.test.ts::the recorded provenance is the transcript it came from` |
| The recorded run asked 400 questions of which 372 are distinct, every repeat is an identity question, and a repeated question carries one answer | `test/real.test.ts::the question set repeats itself in one domain, and the README says by how much` |

## The post-hoc re-score of the real-model arm

These claims come from a scorer chosen after the replies had been read. The
tests pin what it does and what it prints; they do not make it a registered
result.

| Claim | Enforced by |
| :-- | :-- |
| `score()` still behaves as recorded: the strict column of the re-score is the recorded arm, 331 and 271 of 400, the per-domain table, p and verdict | `test/rescore.test.ts::the strict column is the recorded arm, number for number` |
| Rules 1 and 3: nothing after `CONFIDENCE:` is read; numeric answers are the last number, commas removed, a date hyphen never read as a minus sign, compared numerically | `test/rescore.test.ts::numbers: the last one stated, commas removed, and a date hyphen is not a minus sign` |
| Rule 2: a reply with no `CONFIDENCE:` line is wrong, even when its last number is the answer (routed `timeline-52`); 3 of the 27 would match the answer under rules 3 and 4: `timeline-20` and `timeline-52` had stated it, `network-38` stopped mid-sentence; the generalist got all 3 right | `test/rescore.test.ts::a reply cut off before its CONFIDENCE line is wrong, even when its last number is the answer` |
| Rule 4: yes/no is the last standalone word; "nothing" or "know" is not a "no" | `test/rescore.test.ts::yes/no: only the standalone words count` |
| Rule 5: any other answer must be an exact final token, never a substring | `test/rescore.test.ts::any other answer is an exact final token, never a substring` |
| A reply that works first and answers last is wrong under the strict scorer and right on its final answer, including a "no" inside the working that is not the answer | `test/rescore.test.ts::a reply that works first and answers last is wrong on its first token and right on its final answer` |
| The 23 routed ledger replies the strict scorer marks wrong all opened with working and end on the right answer | `test/rescore.test.ts::every routed ledger reply the strict scorer marks wrong opened with working and ends on the right answer` |
| A strict miss that is right on its final answer is classified by its first token after stripping a trailing `.` or `-`: the answer means trailing punctuation, another number or yes/no means it opened with a wrong answer, anything else means it opened with working | `test/rescore.test.ts::a strict miss right on its final answer is classified by its first token with a trailing . or - stripped` |
| "No." is wrong under the strict scorer and right on its final answer; no recorded reply opens with "Yes.", and 21 open with "No." | `test/rescore.test.ts::"No." keeps its full stop under the strict scorer and loses it under the final-answer scorer`; `test/rescore.test.ts::no recorded reply opens with "Yes."; every full-stop opening is "No."` |
| The 27 replies with no `CONFIDENCE:` line all stopped at the 256-token limit; 5 more reached the limit inside their `CONFIDENCE:` line after stating an answer | `test/rescore.test.ts::every reply without a CONFIDENCE line stopped at the 256-token limit` |
| A finished reply with the wrong answer is wrong under both scorers | `test/rescore.test.ts::a finished reply with the wrong answer is wrong under both scorers` |
| Final-answer accuracy 352/400 (88.0%) and 364/400 (91.0%), and the per-domain table (100/100, 86/90, 74/74, 92/100) | `test/rescore.test.ts::the re-score pins every number it prints` |
| Final-answer McNemar b 22, c 34, p 0.141, B-A +3.0pp [-0.5, 6.8], "no separable difference"; strict b 81, c 21 | same test |
| Why the strict scorer marked a reply wrong (generalist 9/12/0/0/48, routed 87/6/0/27/9), no strict-right reply wrong on its final answer, 3 truncated replies that would match the answer under rules 3 and 4 | same test |
| The losing reply on each discordant pair: strict b 53 working, 22 truncated, 6 "No."; strict c 12 "No.", 9 wrong; final b 22 truncated; final c 34 wrong | same test |
| On final answers the 22 questions only the generalist got right are the same 22 truncated routed replies the strict scorer also gave it | `test/rescore.test.ts::on final answers, the questions only the generalist got right are the truncated routed replies the strict scorer also gave it` |
| Over the 372 distinct prompts the final-answer result is b 22, c 29, p 0.40 (strict b 81, c 16); the 28 duplicates add 5 routed-only pairs and no generalist-only ones | `test/rescore.test.ts::the final-answer result stays not significant over distinct prompts and with the late cut-offs counted as truncated` |
| Counting the 5 replies that reached the limit inside their `CONFIDENCE:` line as truncated too gives p 0.42, still not significant | same test |
| Every question asks for the answer only ("Answer with the number only." or "Answer yes or no only."), and the routed ledger and timeline primings ask for working first | `test/rescore.test.ts::every question asks for the answer only, and the routed ledger and timeline primings ask for working first` |
| `npm run rescore` prints exactly these numbers | `test/rescore.test.ts::the re-score pins every number it prints` (compares the whole printed report) |
| Re-scoring leaves the transcript and the pinned summary byte-for-byte unchanged | `test/rescore.test.ts::the recorded transcript and summary are the pinned bytes, before and after a re-score` |
| The pins bite | verified by mutation: changing the pinned final routed count from 364 to 365, dropping the truncation rule, or keeping the full stop on "No." each turns `test/rescore.test.ts` red |

## Reproducibility

| Claim | Enforced by |
| :-- | :-- |
| The same seed gives the same numbers | `test/study.test.ts::the study is reproducible: the same seed gives the same accuracies` |
| Each domain routes to its specialist; the unspecialised one to the generalist | `test/study.test.ts::each domain routes to its specialist, and the unspecialised one to the generalist` |
| Changing the world, bars, router policy or binning breaks the build | verified by mutation: setting `ECE_BINS` to 12 turns `test/pinned.test.ts` red |

## Claims deliberately NOT enforced by a test

- **That the final-answer rule is the right reading.** It was chosen after
  the replies had been read. The tests pin what it does and what it prints,
  not that it is the correct way to score this arm; the README labels it post
  hoc for that reason.

- **What the recorded arm means beyond its own run.** The tables are
  enforced; the reading of them is not. "One model, one prompt set, one day"
  and the account of why priming lowered the strict score, including that the
  working-first openings and cut-offs are side effects of the priming, are
  judgement, and the README says so rather than dressing them as results.

- **The detection curve** (`npm run power`: 0/10 at ≤160 examples, 5/10 at 240,
  10/10 from 400). It is a 10-seed × 9-size sweep taking far longer than the
  suite should, so it is reproducible on demand rather than asserted in CI.
  The README prints the measured numbers and names the script that produces them.
- **"Synthetic, not evidence about real models."** A framing statement about
  what the study is not; there is nothing to falsify.
