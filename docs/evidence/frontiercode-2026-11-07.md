# FrontierCode per-effort rows, retrieved 2026-11-07

Source: Cognition's public result file, <https://cognition.com/data/frontiercode-leaderboard/data.json>, fetched 2026-11-07 through a summarising fetch tool. Methodology: <https://cognition.com/frontiercode>. Cognition's live leaderboard moved to FrontierCode 2.0 on 2026-10-27; the fetched rows carry a `main` and an `extended` variant, and the benchmark version of these rows was not independently confirmed. Cross-check: the `main` rows for Haiku 5.5 match the FrontierCode 1.1 Main figures that kingy.ai published on 2026-10-07 from the same file.

**Release gate:** before tagging a release, re-download the file, confirm every row below (model, harness, variant, benchmark version) and reconcile the README table against this file.

Field mapping used here: score = `new_score` (composite, 0–1), pass rate = `correct`, cost = mean `cost` in USD per rollout (includes rollouts without an acceptable patch), tokens = mean `tokens` output per rollout. Harness: `claude-code` for Anthropic models, `codex` for OpenAI models. Only the `main` variant feeds the README table.

## Claude Haiku 5.5 (harness claude-code)

| Effort | Variant | Score | Pass rate | Cost | Tokens |
|---|---|---|---|---|---|
| low | main | .3476 | .385 | $0.0596 | 23868 |
| medium | main | .4163 | .462 | $0.1300 | 36172 |
| high | main | .4189 | .466 | $0.2560 | 55149 |
| xhigh | main | .4583 | .508 | $0.6297 | 100847 |
| max | main | .4636 | .5165 | $1.3284 | 181387 |
| low | extended | .4819 | .53 | $0.0486 | 20240 |
| medium | extended | .5504 | .6067 | $0.1021 | 30398 |
| high | extended | .5588 | .616 | $0.1998 | 46347 |
| xhigh | extended | .5812 | .6413 | $0.4876 | 84943 |
| max | extended | .5843 | .647 | $1.0803 | 157710 |

## GPT-6 Luna (harness codex)

| Effort | Variant | Score | Pass rate | Cost | Tokens |
|---|---|---|---|---|---|
| low | main | .2566 | .292 | $0.0199 | 7325 |
| medium | main | .3553 | .4 | $0.0512 | 21248 |
| high | main | .3726 | .4193 | $0.0646 | 28999 |
| xhigh | main | .3710 | .418 | $0.0700 | 33153 |
| max | main | .4242 | .478 | $0.1027 | 56553 |
| low | extended | .3907 | .436 | $0.0177 | 6473 |
| medium | extended | .5015 | .556 | $0.0430 | 18033 |
| high | extended | .5130 | .5689 | $0.0532 | 24316 |
| xhigh | extended | .5143 | .5693 | $0.0576 | 27772 |
| max | extended | .5610 | .6227 | $0.0831 | 46962 |

## Claude Sonnet 5.5 (harness claude-code, coordinator reference)

| Effort | Variant | Score | Pass rate | Cost | Tokens |
|---|---|---|---|---|---|
| low | main | .2933 | .328 | $0.194 | 6353 |
| medium | main | .3648 | .406 | $0.2365 | 7597 |
| high | main | .4938 | .5435 | $0.4175 | 13003 |
| xhigh | main | .5209 | .572 | $1.5881 | 47385 |
| max | main | .4621 | .5115 | $20.7818 | 595651 |

## GPT-6.1 Sol (harness codex, coordinator reference)

| Effort | Variant | Score | Pass rate | Cost | Tokens |
|---|---|---|---|---|---|
| low | main | .4546 | .5065 | $0.2457 | 7375 |
| medium | main | .5023 | .558 | $0.3607 | 11365 |
| high | main | .4798 | .532 | $0.498 | 16365 |
| xhigh | main | .4929 | .5465 | $0.5599 | 19203 |
| max | main | .4757 | .528 | $0.8481 | 35264 |

## Deltas computed from the unrounded `main` values

| Model | Step | Score | Cost |
|---|---|---|---|
| Haiku 5.5 | low → medium | +6.87 pts | 2.18× |
| Haiku 5.5 | medium → high | +0.26 pts | 1.97× |
| Haiku 5.5 | high → xhigh | +3.94 pts | 2.46× |
| Haiku 5.5 | xhigh → max | +0.53 pts | 2.11× |
| GPT-6 Luna | low → medium | +9.87 pts | 2.57× |
| GPT-6 Luna | medium → high | +1.73 pts | 1.26× |
| GPT-6 Luna | high → xhigh | −0.16 pts | 1.08× |
| GPT-6 Luna | medium → max | +6.89 pts | 2.01× |

These are point estimates from one leaderboard run per cell, without confidence intervals.

## Corroborating independent sources

- Hex DataBench v1.1 (Hex; leaderboard dated 2026-09-22, read via <https://aiagentstore.ai/ai-models/reasoning-effort/gpt-6-luna>): GPT-6 Luna 30.3 / 42.7 / 46.0 / 46.0 / 52.3 at $0.0108 / $0.0191 / $0.0258 / $0.0396 / $0.058 per task for low / medium / high / xhigh / max.
- Artificial Analysis Intelligence Index v4.3.2 (read via <https://aihubmix.com/blog/claude-haiku-5-5-effort-levels-medium-is-the-default-low-is-often-enough>): Claude Haiku 5.5 29 / 34 / 38 / 41 / 43 at $0.02 / $0.05 / $0.08 / $0.12 / $0.21 per task. The current page at <https://artificialanalysis.ai/models/claude-haiku-5-5> reports 36 at max under a newer index version; versions are not comparable.
- Terminal-Bench 4.0 public leaderboard snapshot of 2026-10-07 (via <https://kingy.ai/blog/claude-haiku-5-5-benchmarks-specs-sol-luna/>): GPT-6 Luna max 16.4% ±2.7 (Codex) versus GPT-6.1 Sol max 58.2% ±3.1.
- Research used as heuristics: Geng & Neubig, "Effective Strategies for Asynchronous Software Engineering Agents" (CAID), arXiv 2603.21489; Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (MAST), arXiv 2503.13657; Chroma, "Context Rot" (2025-07-14); Mittal, "How Fast Do Agents Rot?", arXiv 2609.01660; Cognition, "Don't Build Multi-Agents" (2025-06-12).
