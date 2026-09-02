# CLAIMS

Every externally falsifiable claim this study makes on its README, mapped to
the executable check that enforces it. A published number with no enforcing
test is a screenshot; if a row here has no test, the sentence should come out
of the README rather than stay on trust.

Run them with `npm test`. The reported tables are additionally reproducible
with `npm run study`, `npm run arms` and `npm run power`.

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
| A recorded run replays to exactly its pinned summary (manifest hash, every accuracy/ECE, per-domain table, verdict, p-value), the committed transcript hashes to the pinned sha256, and the pin records at least one live call | `test/real.test.ts::a recorded run replays to exactly its pinned summary` - **skipped with a stated reason until a transcript is committed** |

## Reproducibility

| Claim | Enforced by |
| :-- | :-- |
| The same seed gives the same numbers | `test/study.test.ts::the study is reproducible: the same seed gives the same accuracies` |
| Each domain routes to its specialist; the unspecialised one to the generalist | `test/study.test.ts::each domain routes to its specialist, and the unspecialised one to the generalist` |
| Changing the world, bars, router policy or binning breaks the build | verified by mutation: setting `ECE_BINS` to 12 turns `test/pinned.test.ts` red |

## Claims deliberately NOT enforced by a test

- **Any number from the real-model arm.** None exist yet: the README says
  "not yet recorded" and prints no table. When a transcript is committed,
  the replay test above becomes the enforcing test for every number printed,
  and for the transcript bytes those numbers came from.

- **The detection curve** (`npm run power`: 0/10 at ≤160 examples, 5/10 at 240,
  10/10 from 400). It is a 10-seed × 9-size sweep taking far longer than the
  suite should, so it is reproducible on demand rather than asserted in CI.
  The README prints the measured numbers and names the script that produces them.
- **"Synthetic, not evidence about real models."** A framing statement about
  what the study is not; there is nothing to falsify.
