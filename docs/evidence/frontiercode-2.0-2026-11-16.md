# FrontierCode 2.0 per-effort rows, retrieved 2026-11-16

Source: Cognition's FrontierCode 2.0 result file, <https://cognition.com/data/frontier-code-2.0/data.json>, downloaded raw with curl on 2026-11-16 (HTTP 200, 41,907 bytes, `Last-Modified: Sat, 14 Nov 2026 03:15:38 GMT`, SHA-256 `6a17027b93bcc461814d7f64a75b049268b12b0d8e5982fa8c0d097f4e24b1f5`). The leaderboard page <https://cognition.com/frontiercode> loads this file. Its changelog records, after the previous retrieval: 2026-11-11, "Updated the cheating scanner to remove false positives … All results are rescored"; 2026-11-12, Gemini 4 Hydrogen added. The file has one subset, `main` (132 tasks), and 32 models. Values below are written by script from the file at the precision it publishes: 4 decimals for scores and rates, 3 for cost.

Field mapping as in [frontiercode-2.0-2026-11-09.md](frontiercode-2.0-2026-11-09.md): score = `new_score`, pass rate = `correct`, cost = mean `cost` in USD per rollout, tokens = mean `tokens`, flagged = `flagged_rate`.

**Affiliation:** Cognition publishes and runs the benchmark. It is not affiliated with Anthropic or OpenAI; it is itself a model vendor with models on this board. One run per cell, no confidence intervals, no raw per-run data.

**Status:** primary coding evidence for the `escalating-agents` 2.0.0 ladders. It supersedes [frontiercode-2.0-2026-11-09.md](frontiercode-2.0-2026-11-09.md) for the current ladders; that file stays as the evidence for 1.2.0. The rescoring raised most scores slightly and left every cost and token value unchanged, so the 2026-11-09 scores differ from the ones below.

**GPT-6.1 Terra is not in the file.** No model name contains "Terra"; the OpenAI rows are GPT-5.5, GPT-5.6 Sol, GPT-6 Astra, GPT-6 Luna, GPT-6 Sol and GPT-6.1 Sol, all in the `codex` harness. Terra's rung therefore has no FrontierCode row. Corroboration from other independent sources is in [independent-sources-2026-11-16.md](independent-sources-2026-11-16.md), and Terra's rung is an initial recommendation to evaluate.

**Release gate:** before tagging a release, re-download the data file the leaderboard page currently loads, confirm the rows below (model, harness, benchmark version), check again for a Terra row, and reconcile the README table against this file.

## Claude Haiku 5.5, cheap worker (harness claude-code)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .1059 | .1182 | $0.065 | 39366 | .0000 |
| medium | .1405 | .1576 | $0.097 | 57582 | .0015 |
| high | .1927 | .2152 | $0.139 | 80993 | .0000 |
| xhigh | .2292 | .2545 | $0.226 | 127735 | .0000 |
| max | .2893 | .3186 | $0.366 | 205112 | .0000 |

## GPT-6 Luna, cheap worker (harness codex)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .0405 | .0455 | $0.023 | 6519 | .0000 |
| medium | .1612 | .1788 | $0.092 | 31360 | .0015 |
| high | .1650 | .1848 | $0.115 | 42170 | .0000 |
| xhigh | .1844 | .2045 | $0.132 | 50565 | .0000 |
| max | .2274 | .2515 | $0.174 | 79659 | .0000 |

## Claude Sonnet 5.5, escalation model (harness claude-code)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .0966 | .1091 | $0.369 | 11265 | .0000 |
| medium | .1496 | .1667 | $0.482 | 14449 | .0000 |
| high | .2295 | .2545 | $1.066 | 27839 | .0000 |
| xhigh | .3650 | .4000 | $3.315 | 80433 | .0000 |
| max | .4224 | .4636 | $19.941 | 514722 | .0121 |

## GPT-6.1 Sol, reference only (harness codex)

Not a worker model in 2.0.0. Kept as the nearest OpenAI reference above Luna in this file.

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .2574 | .2848 | $0.341 | 10042 | .0000 |
| medium | .3027 | .3303 | $0.492 | 15686 | .0000 |
| high | .3509 | .3833 | $0.647 | 22419 | .0000 |
| xhigh | .3303 | .3606 | $0.695 | 24789 | .0000 |
| max | .3965 | .4303 | $1.029 | 41479 | .0000 |

## Deltas computed from the file values

| Model | Step | Score | Cost |
|---|---|---|---|
| Haiku 5.5 | low → medium | +3.46 pts | 1.49× |
| Haiku 5.5 | medium → high | +5.22 pts | 1.43× |
| GPT-6 Luna | low → medium | +12.07 pts | 4.00× |
| GPT-6 Luna | medium → high | +0.38 pts | 1.25× |
| Sonnet 5.5 | low → medium | +5.30 pts | 1.31× |
| Sonnet 5.5 | medium → high | +7.99 pts | 2.21× |

These are point estimates from one leaderboard run per cell, without confidence intervals.

## Cheap model at `high` against the escalation model

Baseline: the cheap model's top rung in 2.0.0, Haiku 5.5 `high` (.1927, $0.139).

| Escalation candidate | Score | Cost | Score vs Haiku high | Cost vs Haiku high |
|---|---|---|---|---|
| Sonnet 5.5 low | .0966 | $0.369 | -9.61 pts | 2.65× |
| Sonnet 5.5 medium | .1496 | $0.482 | -4.31 pts | 3.47× |
| Sonnet 5.5 high | .2295 | $1.066 | +3.68 pts | 7.67× |

Sonnet 5.5 at `low` and `medium` scores below Haiku 5.5 at `high` and costs 2.7 to 3.5 times as much. Only Sonnet `high` scores above it. For GPT-6 Luna `high` (.1650, $0.115) the file has no Terra row to compare with; the nearest row, GPT-6.1 Sol `low` (.2574, $0.341), is a stronger model and is no evidence about Terra.

## Ladder decision for 2.0.0

Every worker starts at `low` on the cheap model (a requirement of the design, not a benchmark result) and effort is limited to `low`, `medium` and `high`.

- **Cheap segment `low → medium → high` on both hosts.** Haiku gains at each step (+3.46 then +5.22 pts). Luna gains +12.07 pts at `medium` and only +0.38 at `high`. A level may be skipped only on both hosts, and Haiku's `high` step is its largest, so `high` stays; on Luna it costs 1.25 times `medium`.
- **Expensive segment: one rung, `high`** (option (b) of the design note). Sonnet `low` and `medium` do not beat Haiku `high` here, so restarting the expensive model at `low` would spend two calls that are each dearer and weaker than the take that just failed.
- **Cost of the `low` start.** A `low` attempt followed by `medium` on failure costs `C_low + (1 − p_low) × C_medium`, where `p_low` is the share of items `low` passes outright. It is cheaper than starting at `medium` only when `p_low` exceeds `C_low / C_medium`: 0.67 for Haiku and 0.25 for Luna. On FrontierCode-sized tasks `p_low` is far below that (0.106 and 0.041), so a `low` start there would cost about 55 % more than a `medium` start on Haiku ($0.152 against $0.097) and about 20 % more on Luna ($0.111 against $0.092), and be slower. These are plug-in estimates from published means, not measurements, and the benchmark does not publish which tasks each effort solves. An earlier version of this note compared the ratio of the two aggregate scores with the cost ratio; that ratio is not the share of `medium`-solvable tasks that `low` solves (the solved sets need not be nested and the file does not publish them), and the conclusion drawn from it (a small saving on Haiku, break-even on Luna) was wrong. The skill's items are much smaller than FrontierCode tasks, which this file cannot measure.
- **Expensive-call weight.** Sonnet `high` costs 7.67× Haiku `high` per rollout; the budget weight is 8 units on Claude Code. The Codex weight (4) rests on Artificial Analysis, not on this file.
- Coding benchmarks are only a proxy for research and data work.
