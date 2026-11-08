# FrontierCode 2.0 per-effort rows, retrieved 2026-11-09

Source: Cognition's FrontierCode 2.0 result file, <https://cognition.com/data/frontier-code-2.0/data.json>, downloaded raw with curl on 2026-11-09 (HTTP 200, 37,294 bytes, `Last-Modified: Sun, 08 Nov 2026 09:57:18 GMT`, SHA-256 `96615ddfc3ff0257a5e0324d1ab7b5f8f0731b411cb002ab0a592957fd35eabe`). The leaderboard page <https://cognition.com/frontiercode> loads this file; its changelog says results reflect FrontierCode 2.0, a rebuilt 132-task suite, from 2026-10-27, and that 1.1 and 1.0 rankings remain on their own posts. The file has one subset, `main` (132 tasks). Values below are written by script from the file at the precision it publishes: 4 decimals for scores and rates, 3 for cost.

Field mapping as in [frontiercode-2026-11-07.md](frontiercode-2026-11-07.md): score = `new_score`, pass rate = `correct`, cost = mean `cost` in USD per rollout, tokens = mean `tokens`. `flagged` is the file's `flagged_rate`, the share of rollouts detected consulting solution-bearing sources and scored zero.

**Status:** primary evidence for the `cheap-parallel-agents` effort ladders from 1.2.0. The 1.1.0 ladders rested on the FrontierCode 1.1 rows in [frontiercode-2026-11-07.md](frontiercode-2026-11-07.md).

**Release gate:** before tagging a release, re-download the data file the leaderboard page currently loads, confirm the rows below (model, harness, benchmark version) and reconcile the README table against this file.

## Claude Haiku 5.5 (harness claude-code)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .1046 | .1168 | $0.065 | 39366 | .0091 |
| medium | .1342 | .1500 | $0.097 | 57582 | .0152 |
| high | .1864 | .2076 | $0.139 | 80993 | .0197 |
| xhigh | .2228 | .2477 | $0.226 | 127735 | .0167 |
| max | .2772 | .3050 | $0.366 | 205112 | .0258 |

## GPT-6 Luna (harness codex)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .0405 | .0455 | $0.023 | 6519 | .0030 |
| medium | .1597 | .1773 | $0.092 | 31360 | .0015 |
| high | .1650 | .1848 | $0.115 | 42170 | .0030 |
| xhigh | .1844 | .2045 | $0.132 | 50565 | .0045 |
| max | .2187 | .2424 | $0.174 | 79659 | .0121 |

## Claude Sonnet 5.5, coordinator reference (harness claude-code)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .0941 | .1062 | $0.369 | 11265 | .0106 |
| medium | .1417 | .1576 | $0.482 | 14449 | .0136 |
| high | .2190 | .2428 | $1.066 | 27839 | .0137 |
| xhigh | .3475 | .3803 | $3.315 | 80433 | .0227 |
| max | .4096 | .4500 | $19.941 | 514722 | .0379 |

## GPT-6.1 Sol, coordinator reference (harness codex)

| Effort | Score | Pass rate | Cost | Tokens | Flagged |
|---|---|---|---|---|---|
| low | .2560 | .2833 | $0.341 | 10042 | .0091 |
| medium | .2958 | .3227 | $0.492 | 15686 | .0136 |
| high | .3482 | .3803 | $0.647 | 22419 | .0152 |
| xhigh | .3233 | .3530 | $0.695 | 24789 | .0167 |
| max | .3895 | .4227 | $1.029 | 41479 | .0167 |

## Deltas computed from the file values

| Model | Step | Score | Cost |
|---|---|---|---|
| Haiku 5.5 | low → medium | +2.96 pts | 1.49× |
| Haiku 5.5 | medium → high | +5.22 pts | 1.43× |
| Haiku 5.5 | high → xhigh | +3.64 pts | 1.63× |
| Haiku 5.5 | xhigh → max | +5.44 pts | 1.62× |
| GPT-6 Luna | low → medium | +11.92 pts | 4.00× |
| GPT-6 Luna | medium → high | +0.53 pts | 1.25× |
| GPT-6 Luna | high → xhigh | +1.94 pts | 1.15× |
| GPT-6 Luna | xhigh → max | +3.43 pts | 1.32× |

These are point estimates from one leaderboard run per cell, without confidence intervals.

## Ladder decision for 1.2.0

The ladder keeps `low` for mechanical items, `medium` as the default, and one escalation rung after a confirmed reasoning failure. The table compares each candidate rung against `medium`; cost per point is the extra mean cost per rollout divided by the score gain in points.

| From `medium` | Haiku 5.5 | GPT-6 Luna |
|---|---|---|
| → high | +5.22 pts at 1.43×, $0.0080/pt | +0.53 pts at 1.25×, $0.0434/pt |
| → xhigh | +8.86 pts at 2.33×, $0.0146/pt | +2.47 pts at 1.43×, $0.0162/pt |
| → max | +14.30 pts at 3.77×, $0.0188/pt | +5.90 pts at 1.89×, $0.0139/pt |

- **Haiku 5.5: `low → medium → max`.** `max` gives by far the largest gain over `medium`. `high` is the cheapest gain per point but a much smaller one, and with a single escalation rung the policy takes the larger step. `high` and `xhigh` are skipped by design, not for lack of gain. Haiku `max` (.2772, $0.366) scores above Sonnet 5.5 `high` (.2190, $1.066) at about a third of the cost; Sonnet `xhigh` (.3475) still scores higher.
- **GPT-6 Luna: `low → medium → max`, unchanged from 1.1.0.** `high` adds little over `medium`, and `max` is both the largest gain and the cheapest per point, so `xhigh` is skipped.
- **Defaults:** Haiku `medium` (.1342, $0.097) scores slightly below Sonnet 5.5 `medium` (.1417, $0.482) at about a fifth of the cost.
- **Coordinator references:** GPT-6.1 Sol `high` (.3482) scores above `medium` (.2958), so the Codex coordinator recommendation becomes `high`. Sonnet 5.5 keeps rising through `xhigh` and `max` at steep cost; its recommendation stays `high`. Both remain initial recommendations to evaluate, extrapolated from solo-coding rows that do not measure coordination quality.
