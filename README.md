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

The question: does routing each query to a task-specialist beat one
generalist model? The honest answer needs more than an accuracy number.
This is the experiment that asks it properly - hypotheses declared before
the run, a frozen corpus and pass bars, per-domain interference analysis,
a significance test on the improvement, and a calibration check on the
result. The models are synthetic and seeded (a rigorous harness, not real
weights); the discipline is the point.

## The finding

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

Three hypotheses, declared in code before the run, and what the numbers
said:

- **H1 - routing is a real improvement.** *Held.* B-A +5.7pp, McNemar
  p=0.0001, bootstrap CI [2.8, 8.6] - separable from noise and above the
  bar, not a lucky sample.
- **H2 - no cross-task interference.** *Held.* The `timeline` domain has no
  specialist; under routing it is answered by the generalist and its
  accuracy is unchanged (69.3% to 69.3%). Adding specialists did not hurt
  the domain without one.
- **H3 - the routed system is accurate but overconfident.** *Held.* It
  clears the 75% accuracy bar (78.0%) yet fails the calibration bar
  (ECE 0.039 to 0.115). The narrow specialists report high, flat
  confidence whether or not they are right; routing inherits it.

**The point a single accuracy number would have missed:** routing made the
system more accurate *and less honest about its confidence*. An eval that
stopped at accuracy would have shipped an overconfident system whose "I'm
sure" can no longer gate a refusal. Only measuring both - the significance
of the win and the calibration of the result - shows the trade the routing
actually made.

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

- `src/study.ts` - the hypotheses (declared as constants) and the harness.
- `src/systems.ts` - the three systems and the careful-router wiring.
- `src/models.ts` - the synthetic generalist and specialists, and the
  planted overconfidence H3 is designed to catch.
