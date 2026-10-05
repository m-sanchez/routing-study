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

**Recorded 2026-09-02. Under strict first-token scoring, routing lost.** One
recording, 744 live calls, replayed by every CI run since. That scorer turned
out to measure the format of a reply as much as its answer; read
[the re-scoring section](#re-scoring-the-real-model-arm-what-the-strict-scorer-measured)
before reading these tables as a finding about routing.

Strict first-token scoring, as registered:

| system | accuracy | ECE | accuracy bar | calibration bar |
| :-- | :-- | :-- | :-- | :-- |
| generalist priming | 82.8% | 0.142 | PASS | FAIL |
| careful-router routed priming | 67.8% | 0.253 | FAIL | FAIL |

Per-domain accuracy under strict first-token scoring, generalist to routed:

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

**What the strict scorer says.** For this model on these questions, telling
an instance it is a domain specialist reduced its accuracy under strict
first-token scoring on three domains out of four, and by 15 points overall.
`careful-router` did exactly what its records told it to: for each question
it picked a model that declared the needed capability at a lower price. The
sharpest strict-scorer case is ledger, where the generalist was perfect and
the routed instance, told to "add and count carefully, one row at a time",
lost 23 points. Those 23 replies show their working first and give the right
answer at the end, and the strict scorer reads only the first token. On final
answers ledger is 100 against 100; the re-scoring section has the full
account. Identity gained from priming under both scorers.

Calibration was scored against the same strict correctness: ECE 0.142 to
0.253, and neither system clears the calibration bar. Those ECE figures carry
the strict scorer's format penalty and are not re-scored here.

**Two things to hold against these numbers.** The question generator repeats
itself in one domain: 400 questions are asked, 372 of them distinct, because
28 identity prompts are duplicates of others in the same run. Duplicates
always carry the same answer, so scoring is consistent, but those items are
perfectly correlated with their twins and McNemar assumes they are not. At
p=1.7e-9 on a 15-point effect that cannot flip the strict verdict, and it is why
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
recording it, and the first row stays where it is. The re-scoring section
below is the one exception to "nothing chosen after seeing an answer", and
it is labelled as such.

### Re-scoring the real-model arm: what the strict scorer measured

**This is post hoc.** The rule in this section was chosen after the recorded
replies had been read and the strict result was known. It does not replace
the registered result: the recorded verdict above stays the strict one, and
`test/real.test.ts` still pins it. What it can do is show what the strict
scorer was measuring.

The strict scorer reads the first token of a reply. Many routed replies open
with working ("Let me carefully identify...") and state the answer at the
end, and the strict scorer marks those wrong whatever the answer. `npm run
rescore` replays the same transcript, with no network, and scores every reply
a second way, on its final answer. The rules follow from the answer types
the question generator produces. They were fixed before this scorer was run
on either arm, but after the replies had been read:

1. Everything from the first `CONFIDENCE:` (any case) to the end of the reply
   is removed, as the strict scorer removes it.
2. A reply with no `CONFIDENCE:` line counts as wrong, whatever it contains.
   There are 27 such replies, all routed, and every one stopped at the
   256-token limit. Five more replies reached the limit inside their
   `CONFIDENCE:` line, after stating an answer, and are scored normally. 3 of
   the 27 end on the right answer and still count as wrong.
3. Numeric answers (ledger, timeline): the last number in the reply. A number
   is a run of digits, optionally comma-grouped in threes and optionally with
   a decimal part; commas are removed and the value is compared numerically.
   A minus sign is not read, so a date such as 2025-03-15 never yields -15.
4. yes/no answers (network, identity): the last standalone word `yes` or
   `no`, in any case, with punctuation ignored. "nothing" or "know" is not
   a "no".
5. Any other answer: the last whitespace-separated token, lowercased and with
   leading and trailing punctuation stripped, must equal the answer exactly;
   a token that merely contains it does not count. The generator produces no
   such answers, and the rule is there so the scorer has no lenient fallback.
6. A reply with nothing of the required shape counts as wrong.

`score()` in `src/real.ts` is untouched; the second scorer lives in
`src/rescore.ts`.

| system | strict | final answer |
| :-- | :-- | :-- |
| generalist priming | 331/400 (82.8%) | 352/400 (88.0%) |
| careful-router routed priming | 271/400 (67.8%) | 364/400 (91.0%) |

Per domain, correct out of 100, generalist / routed:

| domain | strict | final answer |
| :-- | :-- | :-- |
| ledger | 100 / 77 | 100 / 100 |
| network | 74 / 63 | 86 / 90 |
| timeline | 74 / 32 | 74 / 74 |
| identity | 83 / 99 | 92 / 100 |

The paired comparison, from `ab-significance` with the same settings as the
recorded arm (A is the generalist, B is routed; b counts questions only A got
right, c questions only B got right; exact McNemar):

| scorer | b | c | p | B-A, 95% interval | verdict |
| :-- | :-- | :-- | :-- | :-- | :-- |
| strict | 81 | 21 | 1.7e-9 | -15.0pp [-19.8, -10.3] | A better |
| final answer | 22 | 34 | 0.141 | +3.0pp [-0.5, 6.8] | no separable difference |

Why the strict scorer marked a reply wrong, and what the final-answer scorer
makes of the same reply:

| reason | generalist | routed | final-answer scorer |
| :-- | :-- | :-- | :-- |
| opened with working | 9 | 87 | right |
| trailing punctuation ("No.") | 12 | 6 | right |
| opened with a wrong answer, ended on the right one | 0 | 0 | right |
| truncated at the 256-token limit | 0 | 27 | wrong |
| genuinely wrong answer | 48 | 9 | wrong |
| total | 69 | 129 | |

No reply the strict scorer marked right is wrong on its final answer, and no
recorded reply opens with "Yes."; the full-stop cases are all "No.".

On the 81 questions the strict scorer gave to the generalist alone, 59
routed replies end on the right answer (53 after opening with working, 6
written "No.") and 22 ran out of tokens before answering. None of the 81 is a
finished reply with a wrong answer. On final answers, the 22 questions only
the generalist got right are those same 22 truncated routed replies, and all
34 questions only routed got right are finished generalist replies with the
wrong answer.

**What this shows.** The strict first-token scorer measured answer format:
its 15-point gap rests on routed replies that opened with working, ran out of
tokens while working, or put a full stop after "No", and on none that
finished with a wrong answer. On final answers the two systems score 88.0%
and 91.0%, and the difference is not significant: exact McNemar p=0.141, with
a 95% interval of -0.5 to +6.8 points that includes zero.

**What it does not show.** It does not show that routing won: the difference
on final answers is within noise, and the rule behind it was chosen after
seeing the data. It does not show that routing lost either. Every question
routed lost on final answers is a reply that ran out of tokens while working,
so the result depends on the 256-token budget as well as on the priming. ECE
is not re-scored. Settling the question would need a new recording with the
scorer declared before the run.

## Run

```bash
npm install       # the four tools, from the npm registry
npm run study     # the report above
npm run arms      # the three failure arms
npm run power     # the detection curve
npm run real      # replay the recorded real-model arm (--live to record)
npm run rescore   # re-score that arm on final answers (post hoc, replay only)
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
