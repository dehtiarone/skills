# Pinning on Claude Code: requested, configured, observed

Read this when `init` prints `KNOWN MISMATCH`, or an `Agent` call rejects `model` or `effort`.

Every call has three facts: what the brief requested, what the configuration allows, and what the host shows afterwards. The report gives one verdict: **Verified** (the host showed matching settings), **Requested but unverified** (overrides were sent, effective settings are not shown), **Known mismatch** (an override, cap or forced setting changes execution). Never report "no mismatch observed" as "guarantees held".

**A Known mismatch stops the run.** This skill's workers are the two listed models at `low`, `medium` or `high`, nothing else. When the host is known to run them on another model or another effort, the script refuses every dispatch. Tell the user what was found and the remedy from the table; do not change configuration yourself. Then either the user corrects the configuration and you start a new run, or the user explicitly accepts the deviation and you record their words: `LEDGER pinning TASK accept "<what the user said>"`. The run continues in a relaxed mode that the log and the report label as such. "Requested but unverified" is not a mismatch and does not stop anything.

| Setting | Effect on workers | Remedy to give the user |
| ------- | ----------------- | ----------------------- |
| `CLAUDE_CODE_EFFORT_LEVEL` | Replaces the per-call `effort`: the effort ladder cannot run | Unset it for this session |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` | One model is forced on every subagent; Claude cannot pass a model when it starts one | Unset it, or set the forced model aside for this session |
| A call hides or rejects `model` or `effort` mid-run | The request cannot be honoured | Run `LEDGER pinning TASK mismatch "<what was hidden or rejected>"`; the cause is a setting, a policy or the client version |
| A worker is shown to have run on other settings (`--ran`) | The request was overridden | The script records the mismatch itself; look for the cause in settings or policy |
| `CLAUDE_CODE_SUBAGENT_MODEL` alone | Only a fallback: the per-call `model` still wins | None needed; not a mismatch |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` | Change what the `haiku` and `sonnet` aliases resolve to | Unset them, or point them at Haiku 5.5 and Sonnet 5.5 |
| `maxEffortLevel`, `availableModels`, organisation caps | Can cap effort below the request or substitute a model | Record it with `LEDGER pinning TASK mismatch "…"` once you see it; the user or their administrator changes the cap |

The script checks the environment variables at `init` and reports a mismatch for all of them except the fallback. It cannot see settings files or organisation policy, so also look at your own `Agent` tool schema once: if `model` or `effort` is missing from it, record that with `LEDGER pinning TASK mismatch "…"` before the first dispatch. A host-forced effort above `high` or below `low`, or a forced model other than the two listed, is a Known mismatch; never request one. The report says **Verified** only when every `result` carried a `--ran` equal to the request (a full model name that contains the alias, such as `claude-haiku-5-5/low` for `haiku/low`, counts as equal).

On another provider the aliases may resolve to different models. Never edit configuration and never start a nested CLI to work around a restriction.

Optional and not shipped: a user who wants pinning that does not depend on per-call parameters can define subagents in `.claude/agents/` with `model: haiku` or `model: sonnet` and an `effort` field. This skill does not need them, because the per-call `model` takes precedence over a definition.

Workers you did not dispatch (a parent that delegates on its own) are outside the ledger: say so in the report, and treat budget, usage and snapshot statements as incomplete.
