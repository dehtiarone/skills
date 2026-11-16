# Independent evidence index, retrieved 2026-11-16

This index lists every source behind a performance, cost or escalation decision in `escalating-agents` 2.0.0. The primary coding rows are in [frontiercode-2.0-2026-11-16.md](frontiercode-2.0-2026-11-16.md).

**Independence rule.** A source counts as evidence only if it is not published, run, funded, co-authored or curated by Anthropic or OpenAI, and is not a benchmark variant either vendor prepared. Each section records the check. Sources that fail it are listed at the end, with the reason, and are not used. Vendor documentation is used only for API facts (model IDs, accepted effort levels, tool parameters), never for performance.

**How to read the numbers.** Unless a section says otherwise these are single runs without confidence intervals, read from the publisher's pages on 2026-11-16. Benchmarks use the publisher's own harness unless stated, so they are not the Claude Code or Codex harness. Coding and agent benchmarks are a proxy for the skill's items, which are much smaller, and only a rough proxy for research and data work.

## 1. Cognition, FrontierCode 2.0

- Publisher and check: Cognition; independent of both vendors; a model vendor itself.
- Task kind: coding, 132 tasks, vendor harnesses (Claude Code, Codex).
- Rows used: Haiku 5.5, GPT-6 Luna and Sonnet 5.5 at `low`, `medium`, `high`. No GPT-6.1 Terra row exists.
- Full rows and caveats: [frontiercode-2.0-2026-11-16.md](frontiercode-2.0-2026-11-16.md).

## 2. Artificial Analysis, Intelligence Index v5.0.1 and its constituent evaluations

- Publisher and check: Artificial Analysis (<https://artificialanalysis.ai/models/claude-haiku-5-5>, `/claude-sonnet-5-5`, `/gpt-6-luna`, `/gpt-6-1-terra`); runs every evaluation itself; investors not stated on the pages read. One constituent, GDPval-AA, is built on an OpenAI dataset and is excluded here; it is not part of the index since v5.0.
- Task kinds: coding (FrontierCode-AA 2.0, Cognition's tasks in AA's harness), terminal agents (Terminal-Bench 4.0 tasks, AA's runs), knowledge work with files (AA-Briefcase), tool use over APIs (AutomationBench-AA), recall (AA-Omniscience).
- The only source with all four models at `low`, `medium` and `high`.

| Model · effort | Index | $ per index task | FrontierCode-AA | Terminal-Bench 4.0 | Briefcase Elo | AutomationBench-AA |
|---|---|---|---|---|---|---|
| Haiku 5.5 · low | 18.6 | 0.044 | .080 | .126 | 1113 | .229 |
| Haiku 5.5 · medium | 24.6 | 0.092 | .161 | .152 | 1366 | .286 |
| Haiku 5.5 · high | 29.9 | 0.159 | .232 | .217 | 1441 | .337 |
| Sonnet 5.5 · low | 25.6 | 0.511 | .071 | .207 | 1268 | .494 |
| Sonnet 5.5 · medium | 30.8 | 0.781 | .110 | .298 | 1437 | .549 |
| Sonnet 5.5 · high | 41.5 | 1.636 | .257 | .439 | 1634 | .594 |
| GPT-6 Luna · low | 9.7 | 0.005 | .022 | .000 | 740 | .120 |
| GPT-6 Luna · medium | 18.5 | 0.042 | .128 | .025 | 1096 | .405 |
| GPT-6 Luna · high | 21.4 | 0.073 | .186 | .045 | 1186 | .478 |
| GPT-6.1 Terra · low | 29.4 | 0.071 | .245 | .152 | 1032 | .562 |
| GPT-6.1 Terra · medium | 38.2 | 0.169 | .345 | .323 | 1191 | .578 |
| GPT-6.1 Terra · high | 42.4 | 0.259 | .375 | .419 | 1265 | .585 |

- Derived time per index task (output tokens ÷ measured speed, not wall-clock), `low` / `medium` / `high`: Haiku 2.2 / 4.0 / 6.5 min; Sonnet 2.6 / 4.0 / 6.9; Luna 0.6 / 3.5 / 5.7; Terra 1.2 / 2.8 / 4.2.
- Caveats: AA's harnesses (Stirrup, mini-swe-agent), not Claude Code or Codex; confidence intervals only for Elo metrics; FrontierCode-AA is judged by GPT-6 Luna, one of the evaluated models.

## 3. Artificial Analysis, Coding Agent Index v2.1

- Check: as section 2. Task kind: coding in the vendors' own harnesses, measured wall-clock. Effort: `max` only, so outside the skill's range; used only as a wall-clock and cost sanity check.
- Rows: Haiku 77.4 min / $2.254; Sonnet 86.8 min / $11.399; Luna 23.5 min / $0.192; Terra 28.1 min / $1.531.

## 4. Hex, DataBench v1.1

- Publisher and check: Hex Technologies (<https://hex.tech/databench/>, updated 2026-11-12); not vendor-run; Hex sells an analytics agent built on these models; the rubric judge is an OpenAI model.
- Task kind: data analysis, 100 tasks, Hex's agent. Terra and Sonnet 5.5 rows are single repetitions.

| Model | low | medium | high |
|---|---|---|---|
| Haiku 5.5 | 23.0% / $0.02 | 28.0% / $0.03 | 28.0% / $0.06 |
| Sonnet 5.5 | not published | 22.0% / $0.19 | not published |
| GPT-6 Luna | 30.3% / $0.01 | 42.7% / $0.02 | 46.0% / $0.03 |
| GPT-6.1 Terra | 46.0% / $0.10 | 44.0% / $0.15 | 51.0% / $0.19 |

- Reading: on data analysis the expensive model's edge is small or absent, and Haiku's gain stops at `medium`.

## 5. Zapier, AutomationBench 1.0.6

- Publisher and check: Zapier (<https://zapier.com/benchmarks>, arXiv 2604.18934); independent of both vendors.
- Task kind: agentic tool use. Rows (`low` / `medium` / `high`): Haiku 6.09 / 8.52 / 10.5%; Luna 1.22 / 9.44 / 14.46%; Sonnet `low` 18.26%, `medium` 23.29%. No Terra row.
- Reading: on tool use Sonnet at `low` beats Haiku at every effort, the opposite of the coding result.

## 6. Vals AI, Vals Index v2.2 and components

- Publisher and check: Vals AI (<https://www.vals.ai/benchmarks/vals_index>); private test sets; venture funded, no vendor funding found.
- Effort: `max` only, outside the skill's range; used for the shape across task kinds.
- Rows (Sonnet vs Haiku; Terra vs Luna): Terminal-Bench 4.0 64.14 vs 36.36; 49.49 vs 13.64. Finance Agent 67.28 vs 65.37; 55.96 vs 56.84. Legal Research 48.08 vs 43.75; 25.96 vs 30.29.
- Reading: the expensive model's edge is large on long terminal work and small or negative on research tasks.

## 7. LiveBench 2.0

- Publisher and check: LiveBench, sponsored by Abacus.AI (<https://livebench.ai>, release 2026-11-06); independent of both vendors. Effort not stated; one run.
- Rows (Sonnet vs Haiku; Terra vs Luna): Coding 77.2 vs 77.6; 89.2 vs 70.8. Data Analysis 59.5 vs 53.1; 82.3 vs 73.4. Research 88.0 vs 84.3; 79.1 vs 48.5. Agentic: Terra 56.2 vs Luna 24.7.

## 8. Research on cascades, retries and effort

| Source | Check | Finding used |
|---|---|---|
| Dekoninck, Baader, Vechev, "A Unified Approach to Routing and Cascading for LLMs", arXiv 2410.10347 (ETH Zurich) | Independent | A cascade pays only with a good after-the-fact quality signal; up-front routing did not work on SWE-Bench |
| Chen, Zaharia, Zou, "FrugalGPT", arXiv 2305.05176 (Stanford) | Independent | Cheap-first cascades match strong-model quality at lower cost when a scorer decides escalation |
| Stroebl, Kapoor, Narayanan, "The Limits of Inference Scaling Through Resampling", arXiv 2411.17501 (Princeton) | Independent | Retrying against an imperfect check has a ceiling set by the check's false-positive rate; few retries are optimal |
| Adnan, Kuhn, "The Debugging Decay Index", arXiv 2506.18403 | Independent | Repair effectiveness drops 60–80 % within two or three attempts |
| Chen et al., "Model Cascading for Code", arXiv 2405.15842 (NYU) | Independent | Cascading wastes money when the cheap model is very weak on the task or the tasks are hard |
| Gandhi et al., "Strong-Weak Model Collaboration for Repo-level Code Generation", arXiv 2505.20182 (CMU) | Independent | Weak-first wins at low budgets, strong-first at higher ones |
| Son et al., "SWE-Router", arXiv 2607.00053 (UCL) | Independent | The strong model is restarted from the original task, not from the weak model's trajectory |
| Ganz et al., "The Handoff Tax", arXiv 2608.24358 | All authors at AWS; not Anthropic or OpenAI | Continuing a cheap trajectory with a strong model was dominated by a fresh strong run |
| Kim et al., "Correlated Errors in Large Language Models", arXiv 2506.07962; Goel et al., arXiv 2502.04313 | Independent | Models tend to be wrong together, so a stronger model rescues only part of what a weaker one fails |
| Sun et al., "What Effort Level Should I Choose?", arXiv 2610.34491 | Together AI; not Anthropic or OpenAI; simulated | Starting at the lowest effort and retrying higher after a failed check matched or beat a fixed top effort, with median savings of 15–41 %, given a reliable verifier |
| Yang et al., "Ares", arXiv 2603.07915 (UCSB, Accenture) | Independent | `medium` captures most of `high`'s gain at far fewer reasoning tokens; `low` collapses on some tasks |
| Prasad et al., "ADaPT", arXiv 2311.05772 | Independent | Decomposing a task only after it fails beat plain retrying by up to 28–33 points |

No study tests a three-level effort ladder followed by a model change; the ladder is an initial recommendation to evaluate.

## 9. Research on parallel orchestration and verification

| Source | Check | Finding used |
|---|---|---|
| Geng, Neubig, "Effective Strategies for Asynchronous Software Engineering Agents" (CAID), arXiv 2603.21489 (CMU) | Independent | Results improved from 2 to 4 parallel engineers and fell at 8 on one benchmark, with little gain beyond 2 on another; cost rose and runtime did not fall |
| Cemri et al., "Why Do Multi-Agent LLM Systems Fail?" (MAST), arXiv 2503.13657 (UC Berkeley) | Independent; funding statement not found | A failure taxonomy: step repetition is the largest single mode and verification failures total about a quarter |
| Xu, Subramanian, Karthik, "AI Agent Pull Requests on GitHub", arXiv 2607.04697 | Independent | Co-active agent pull-request pairs conflict 19.8–41.7 % of the time |
| Cho, Lee, "AgentRoom", arXiv 2608.23740 | Independent | Judged quality peaked at two agents and declined at three and four |
| Sinha et al., "The Illusion of Diminishing Returns", arXiv 2509.09677 | Independent | Per-step accuracy falls with the number of steps, and earlier errors in context make it worse |
| Lu et al., "AgentRewardBench", arXiv 2504.08942 | Independent of both vendors | No LLM judge exceeded 70 % precision on agent trajectories |
| Wang et al., "SWE-Review", arXiv 2607.06065 | Huawei authors; not Anthropic or OpenAI | LLM reviewers falsely approved about a fifth of a strong generator's patches, mostly citing passing tests |
| Rawat, Flek, "Plausible but Wrong", arXiv 2604.25345; Beel et al., arXiv 2502.14297 | Independent | Silent wrong numbers are the dominant failure in agent-run scientific and data workflows |
| Onweller et al., "Cited but Not Verified", arXiv 2605.06635 | PwC authors; not Anthropic or OpenAI | Deep-research citations resolve more than 94 % of the time, but the cited claim is supported only 39–77 % of the time |

No study gives a cap for read-only fan-out, and none compares no-progress detectors.

## 10. Sources cited by earlier releases, re-checked

- CAID and MAST: verified; see section 9. CAID does not show that parallel delegation is cheaper or faster.
- Chroma, "Context Rot" (<https://www.trychroma.com/research/context-rot>): a vendor report on retrieval, question answering and copying tasks. Applying it to coordinator quality is an extrapolation.
- Mittal, arXiv 2609.01660: a single-author preprint. It finds that step count, not context length, drives decay, and that truncating context made decay worse. Earlier releases cited it for "short focused worker episodes", which it does not say; it supports few dependent steps per worker.
- Cognition, "Don't Build Multi-Agents": an opinion piece without data. The same author's later "Multi-Agents: What's Actually Working" endorses multi-agent setups in which writes stay single-threaded.

## Excluded as affiliated, or not usable

| Source | Reason |
|---|---|
| Terminal-Bench 4.1 official leaderboard | Its leaderboard experiments are supported by grants from OpenAI and Anthropic |
| Epoch AI, Epoch Capabilities Index | Paid work for OpenAI and Anthropic listed on its funding page |
| GDPval-AA (Artificial Analysis) | Built on an OpenAI dataset |
| SWE-bench Verified figures | Subset curated by OpenAI |
| Kapoor et al., Holistic Agent Leaderboard, arXiv 2510.11977 | OpenAI API credits acknowledged |
| Li et al., "The Silent Failures in Agentic Data Science", arXiv 2610.14115 | OpenAI compute credits acknowledged |
| Olausson et al., "Is Self-Repair a Silver Bullet for Code Generation?", arXiv 2306.09896 | Microsoft Research co-authors; treated as unclear and not relied on |
| Scale SEAL SWE Atlas v1.1 | Effort not stated; ownership not verified; judged by an OpenAI model |
| Vendor model cards, launch posts and vendor-reported scores | Vendor material |
| METR time horizons, Aider Polyglot, swebench.com, Princeton HAL pages, OSWorld, tau-bench, DABstep | No rows for these four models |
| LMArena, The New Stack's Terra test | Could not be read (HTTP 403) |

## What could not be found

- GPT-6.1 Terra in the Codex harness at `low`, `medium` or `high`.
- Sonnet 5.5 on data analysis at any effort other than `medium`.
- Any independent research or retrieval benchmark that reports these models per effort level.
- Measured wall-clock below `max`, other than Hex's latency column.
- Run-to-run variance for the pass-rate metrics.
