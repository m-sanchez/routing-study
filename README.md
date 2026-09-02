# routing-study

![Node](https://img.shields.io/badge/node-%3E%3D22.18-5FA04E?logo=nodedotjs&logoColor=white)
[![CI](https://github.com/m-sanchez/routing-study/actions/workflows/test.yml/badge.svg)](https://github.com/m-sanchez/routing-study/actions/workflows/test.yml)
![Reproducible](https://img.shields.io/badge/seeded-reproducible-2F6F44)
![License](https://img.shields.io/badge/license-MIT-6E6E6E)

> **In plain English:** a full worked example that plugs several of these tools together to show why you must judge an AI system on whether its confidence is honest, not just whether it is accurate.

A reproducible specialist-vs-generalist routing study, built by composing
the toolkit: [careful-router](https://github.com/m-sanchez/careful-router)
routes, [frozen-eval](https://github.com/m-sanchez/frozen-eval) holds the
bars, [calibrated](https://github.com/m-sanchez/calibrated) checks the
confidence, and [ab-significance](https://github.com/m-sanchez/ab-significance)
decides whether the win is real.

[More tools](https://github.com/m-sanchez) · [Working rules](https://miguelsanchez.co.uk/ethics)

**This is a demonstration, not a discovery.** The synthetic world is
*designed* with a known trade planted in it: specialists that are accurate
on their own domain but overconfident everywhere. The study's job is to
show the toolkit measures that trade correctly - so a real pipeline built
the same way would catch it, instead of shipping on an accuracy number
alone. The value is the methodology, on a world where the ground truth is
known; it is not evidence about any real model.

## What the toolkit surfaces

`npm run study`, at the reported seed:

```
system                   accuracy   ECE     accuracy bar   calibration bar
generalist only          72.3%      0.039   FAIL           PASS
careful-router routed    78.0%      0.115   PASS           FAIL
oracle routed            78.0%      0.115   PASS           FAIL

per-domain accuracy (generalist -> routed):
  ledger     75.0% -> 79.3%
  network    74.3% -> 80.3%
  timeline   69.3% -> 69.3%  (no specialist)
  identity   70.7% -> 83.0%
```

Two checks the measurement confirms, and one dispatch invariant it
verifies:

- **C1 - the accuracy win is real, not a credulously-read delta.**
  *Confirmed.* B-A +5.7pp, McNemar p=0.0001, bootstrap CI [2.8, 8.6]:
  ab-significance separates the planted improvement from sampling noise
  rather than trusting the raw gap.
- **C3 - the routed system is accurate but overconfident.** *Confirmed.*
  It clears the 75% accuracy bar (78.0%) yet fails the calibration bar
  (ECE 0.039 to 0.115). The specialists report high, flat confidence
  whether or not they are right; routing inherits it, and calibrated +
  frozen-eval catch it.
- **Invariant - no cross-task interference.** *Verified, not hypothesised.*
  Routing sends the unspecialised `timeline` domain to the same generalist
  the baseline uses, so its outcomes are byte-identical (69.3% either way).
  This is a dispatch-correctness property that cannot fail; it is
  deliberately not dressed up as an empirical result.

**The point a single accuracy number would have missed:** routing made the
system more accurate *and less honest about its confidence*. An eval that
stopped at accuracy would have shipped an overconfident system whose "I'm
sure" can no longer gate a refusal. Because the world was built to exhibit
exactly this trade, the study is really a test that the tooling reports it
- the significance of the win and the calibration of the result - rather
than a claim that the trade was unknown.

## How it uses the toolkit

- **careful-router** routes every example by declared capability over a
  priced registry; the study verifies it matches the oracle when
  capabilities are declared correctly.
- **frozen-eval** freezes the corpus and the two pass bars (`accuracy >=
  0.75`, `ece <= 0.10`) *before* any system runs, and scores each system
  against them.
- **calibrated** computes each system's ECE - the measure that catches the
  overconfidence.
- **ab-significance** compares routed against generalist on the
  common-valid subset, so H1 is a tested claim, not an eyeballed delta.

The four are real dependencies resolved from the npm registry with integrity
hashes, so this repo is also a working proof that the published tarballs
install and compose - not just that the source trees do.

The audit primitives are used rather than cited: the corpus is verified
against the manifest it was frozen under before anything is scored, the
calibration number is produced by frozen-eval's corpus judge so the bar it
gates lives *inside* the freeze, per-item confidence is recorded so that
number is recomputable from the record alone, and the three runs are written
to a hash-chained ledger which the study then replays - recomputing each
aggregate from that entry's own scores, not merely walking the chain.

## The arms that are supposed to fail

A study whose checks pass on every world it is handed is not measuring
anything. Three negative controls plant a defect and assert the check that
should catch it does (`npm run arms`):

| Arm | World | What the toolkit does |
| :-- | :-- | :-- |
| A: capability over-declaration | one specialist declares every domain and is priced cheapest, so the router sends everything to a model good at one lane | routed accuracy collapses to 45.2%; ab-significance reports **A better** - the misroute is caught |
| B: marginal specialists | specialists at 0.82 against a generalist at 0.80: a real but tiny edge | **no separable difference** - the study can decline to call a win |
| C: regression behind an improving aggregate | the same over-declaration, merely *tied* on price | **B better** (72.3% -> 76.9%) while the ledger lane is quietly worse than the honest registry gives |

Arm C is the one worth reading twice, and it was not designed - it fell out
of getting arm A wrong first. Nothing in it is broken: the router obeys its
policy, the eval computes correctly, and routing really does beat the
baseline. A lane is still worse than it should be, and no number this study
would otherwise print says so. Catching it needs a comparison the study does
not normally run: routed-with-the-lie against routed-without-it.

## How much data this needed

`npm run power` sweeps the same planted world over ten seeds per size and
reports how often ab-significance actually returns "B better":

| examples | 20 | 40 | 60 | 100 | 160 | 240 | 400 | 600 | 1200 |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| detected | 0/10 | 0/10 | 0/10 | 0/10 | 0/10 | 5/10 | 10/10 | 10/10 | 10/10 |

Nothing is detected at or below 160 examples, 240 is a coin flip, and
detection is reliable from 400 up. The headline run sits at 1,200, so the
result rests on a detectable effect rather than on sample size alone. Note
the mean effect is *larger* at the smallest sizes (+9pp, +12pp) and still
invisible - which is the whole reason the test is run instead of reading the
difference off the table.

## The real-model arm

Everything above is a designed world. `src/real.ts` asks the same question
of a real model: on questions with a checkable answer, does routing each one
to a domain-primed instance of one cheap model beat sending everything to a
generically-primed instance of the same model - and does the toolkit report
that honestly?

- Four domains, generated from a seed with a checkable answer each: ledger
  sums and counts, directed-graph reachability, days between dated events,
  and whether two noisy records are the same person. `careful-router` routes
  every question over a capability registry in which each "specialist" is
  the same model behind a different priming - the honest real-world shape of
  a specialist when you only have one model.
- The corpus is frozen and verified, ECE comes from `frozen-eval`'s corpus
  judge over the model's own stated confidence, both runs go into a
  hash-chained ledger the arm replays, and `ab-significance` gives the
  verdict. Same instruments as the synthetic study, real answers.
- **Every model answer is recorded.** Requests are keyed by a hash of
  (model, priming, question) and appended to `study/transcripts/real.jsonl`;
  a replay run answers from the transcript and opens no socket. CI only
  replays. Live mode - `npm run real -- --live` - needs a credential, spends
  money (well under a dollar at `claude-haiku-4-5` pricing for the default
  400 questions), and is refused under CI.

**Recorded 2026-09-02. Routing lost.** One recording, 744 live calls,
replayed by every CI run since.

| system | accuracy | ECE | accuracy bar | calibration bar |
| :-- | :-- | :-- | :-- | :-- |
| generalist priming | 82.8% | 0.142 | PASS | FAIL |
| careful-router routed priming | 67.8% | 0.253 | FAIL | FAIL |

Per-domain accuracy, generalist to routed:

| domain | generalist | routed | change |
| :-- | :-- | :-- | :-- |
| ledger | 100.0% | 77.0% | -23.0pp |
| network | 74.0% | 63.0% | -11.0pp |
| timeline | 74.0% | 32.0% | -42.0pp |
| identity | 83.0% | 99.0% | +16.0pp |

`ab-significance`: on the 400 examples both systems scored, A 82.8%, B 67.8%,
McNemar p=0.0000 as printed and 1.7e-9 in the pinned summary, B-A -15.0pp
[-19.8, -10.3]. A is better, beyond noise and beyond the declared bar.
`frozen-eval`: manifest 476d2916b67e, ledger 2 entries, chain intact,
arithmetic replayed.

```
provenance:
  model            claude-haiku-4-5
  recorded at      2026-09-02T15:17:28.050Z
  seed             1
  per domain       100 (n = 400)
  live calls       744
  tokens in / out  101838 / 29823
  transcript       sha256 762f627649e9
  mode             replay (no network)
```

**What it says.** For this model on these questions, telling an instance it
is a domain specialist made it worse on three domains out of four, and worse
overall by 15 points. `careful-router` did exactly what its records told it
to: for each question it picked a model that declared the needed capability
at a lower price. The routing was correct; the premise underneath it - that
a domain-primed instance is at least as good on its own domain - was false.
The sharpest case is ledger, where the generalist was already perfect and
"add and count carefully, one row at a time" cost it 23 points. Only
identity, the most mechanical task, gained from priming.

Calibration moved the same way: the routed system is both less accurate and
less honest about it, ECE 0.142 to 0.253, and neither system clears the
calibration bar. An accuracy-only eval that assumed routing helps would have
shipped a 15-point regression with more confident wrong answers attached.
The instruments that caught a planted calibration failure in the designed
world caught a real accuracy failure here, and named which model was better
rather than the one the design expected.

**Two things to hold against these numbers.** The question generator repeats
itself in one domain: 400 questions are asked, 372 of them distinct, because
28 identity prompts are duplicates of others in the same run. Duplicates
always carry the same answer, so scoring is consistent, but those items are
perfectly correlated with their twins and McNemar assumes they are not. At
p=1.7e-9 on a 15-point effect that cannot flip the verdict, and it is why
the transcript has 744 entries rather than 800: a repeated prompt is asked
once. And 400 questions is the floor at which this harness reliably
separates a planted +5.7pp, so a smaller real effect could honestly have
come back "no separable difference". This one was nowhere near the floor.

This is one model, one prompt set, one day. It says whether routing to
domain-primed instances helped this model on these questions, and whether
the toolkit reported that honestly. It is not evidence about routing in
general, and a different model or a different priming could land anywhere.

### How to read the numbers

The arm was registered in advance by commit order: the harness, the question
generators, the bars and this paragraph were all committed before any
transcript existed, so nothing about what counts as a pass was chosen after
seeing an answer. The protocol is one recording. Once a transcript is
committed, CI replays it on every push with no network and holds the replay
to the pinned summary in `study/transcripts/real.summary.json`, which
carries every reported number together with the sha256 of the transcript
bytes, the number of live calls the recording made and the tokens it spent;
an edited transcript fails the build before any number is compared. If the arm is ever
recorded again, the new run is added as a dated row with the reason for
recording it, and the first row stays where it is.

## Run

```bash
npm install       # the four tools, from the npm registry
npm run study     # the report above
npm run arms      # the three failure arms
npm run power     # the detection curve
npm run real      # replay the recorded real-model arm (--live to record)
npm test
npm run typecheck
```

Node 22.18+. Synthetic, seeded, reproducible - and the numbers above are
pinned exactly by `test/pinned.test.ts`, not asserted as inequalities: the
manifest hash, every accuracy and ECE, the per-domain table and the McNemar
p-value. Change the world, the bars, the router's policy or the calibration
binning and the build breaks rather than quietly restating the study on
different ground.

## Reading order

- `src/study.ts` - the checks and the dispatch invariant (as constants),
  and the harness.
- `src/systems.ts` - the three systems and the careful-router wiring.
- `src/models.ts` - the synthetic generalist and specialists, and the
  planted overconfidence H3 is designed to catch.
