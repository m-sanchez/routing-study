# routing-study

![Node](https://img.shields.io/badge/node-%3E%3D22.18-5FA04E?logo=nodedotjs&logoColor=white)
[![CI](https://github.com/m-sanchez/routing-study/actions/workflows/test.yml/badge.svg)](https://github.com/m-sanchez/routing-study/actions/workflows/test.yml)
![Reproducible](https://img.shields.io/badge/seeded-reproducible-2F6F44)
![License](https://img.shields.io/badge/license-MIT-6E6E6E)

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

The four are real dependencies (pinned git tags), so this repo is also a
working proof that the tools install and compose.

## Run

```bash
npm install       # pulls the four tools from their git tags and builds them
npm run study     # the report above
npm test
npm run typecheck
```

Node 22.18+. Synthetic, seeded, reproducible: the same seed gives the same
numbers, pinned by a test.

## Reading order

- `src/study.ts` - the checks and the dispatch invariant (as constants),
  and the harness.
- `src/systems.ts` - the three systems and the careful-router wiring.
- `src/models.ts` - the synthetic generalist and specialists, and the
  planted overconfidence H3 is designed to catch.
