# Pinning on Claude Code: requested, configured, observed

Read this when `init` prints `KNOWN MISMATCH`, or an `Agent` call rejects `model` or `effort`.

Every call has three facts: what the brief requested, what the configuration allows, and what the host shows afterwards. The report gives one verdict: **Verified** (the host showed matching settings), **Requested but unverified** (overrides were sent, effective settings are not shown), **Known mismatch** (an override, cap or forced setting changes execution). Disclose a Known mismatch to the user at once, continue as best effort, and never report "no mismatch observed" as "guarantees held".

| Setting | Effect on workers | What to do |
| ------- | ----------------- | ---------- |
| `CLAUDE_CODE_EFFORT_LEVEL` | Replaces the per-call `effort`; the effort ladder collapses to fresh takes with corrections | Keep sending the requested effort; record what ran with `--ran` |
| `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` | One model is forced on every subagent; the `model` parameter may disappear from the `Agent` schema | Continue with the forced model; every call is a mismatch on model |
| A call hides or rejects `model` or `effort` mid-run | The request cannot be honoured | Run `LEDGER pinning TASK mismatch "<what was hidden or rejected>"`, stop sending that parameter, continue |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Only a fallback: the per-call `model` still wins | No action |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` | Change what the `haiku` and `sonnet` aliases resolve to; the target may not support effort | Continue; report the resolved model |
| `maxEffortLevel`, `availableModels`, organisation caps | Can cap effort below the request or substitute a model | Continue; report what ran |

The script checks the environment variables at `init` and reports a mismatch for all of them except the fallback. It cannot see settings files or organisation policy, so also look at your own `Agent` tool schema once: pass `model` while the schema has it, pass `effort` while the schema has it, and stop sending a parameter the host rejected once. A host-forced effort above `high` or below `low` is a Known mismatch: record it with `LEDGER pinning TASK mismatch "…"`; never request one. The report says **Verified** only when every `result` carried a `--ran` equal to the request.

On another provider the aliases may resolve to different models. Never edit configuration and never start a nested CLI to work around a restriction.

Optional and not shipped: a user who wants pinning that does not depend on per-call parameters can define subagents in `.claude/agents/` with `model: haiku` or `model: sonnet` and an `effort` field. This skill does not need them, because the per-call `model` takes precedence over a definition.

Workers you did not dispatch (a parent that delegates on its own) are outside the ledger: say so in the report, and treat budget, usage and snapshot statements as incomplete.
