# Pinning on Codex: requested, configured, observed

Read this when `spawn_agent` hides or rejects `model` or `reasoning_effort`, or a worker ran on other settings than requested.

Every call has three facts: what the brief requested, what the configuration allows, and what the host shows afterwards. The report gives one verdict: **Verified** (the host showed matching settings), **Requested but unverified** (overrides were sent, effective settings are not shown), **Known mismatch** (an override, cap or forced setting changes execution). Disclose a Known mismatch to the user at once, continue as best effort, and never report "no mismatch observed" as "guarantees held".

Look at your own `spawn_agent` tool schema once, before the first dispatch.

| Situation | Effect on workers | What to do |
| --------- | ----------------- | ---------- |
| The schema accepts `model` and `reasoning_effort` | Per-call pinning works for spawns with `fork_turns: "none"` | Send both on every spawn; record what ran with `--ran` when the host shows it |
| The schema hides them, or the backend rejects the override | Workers inherit the configured default; the effort ladder collapses to fresh takes with corrections | Print the configuration below once, continue, and report Known mismatch or Requested but unverified |
| A spawn with full history (`fork_turns: "all"`) | Overrides are rejected; the worker inherits your model | Never use it |
| The parent runs at `ultra` | It may delegate on its own, outside the ledger | Say so; treat budget, usage and snapshot statements as incomplete for workers you did not dispatch |

Configuration a user can add when per-call overrides are unavailable. Show it; never edit configuration yourself and never start a nested CLI:

```toml
# ~/.codex/config.toml or .codex/config.toml
[agents]
default_subagent_model = "gpt-6-luna"
default_subagent_reasoning_effort = "low"
```

```toml
# .codex/agents/luna-worker.toml: a role for cheap workers
model = "gpt-6-luna"
model_reasoning_effort = "low"
```

```toml
# .codex/agents/terra-worker.toml: a role for the gated level 4 take
model = "gpt-6.1-terra"
model_reasoning_effort = "high"
```

A role fixes one model and one effort, so a full ladder without per-call overrides needs one role per level. The `hide_spawn_agent_metadata` feature flag is version-dependent. Configuration files are evidence of configuration only: profiles and startup overrides may differ from what a session runs.

Both worker models accept `low`, `medium` and `high`. A host-forced effort above `high` or below `low` is a Known mismatch; never request one. If a fallback effort must be chosen because the requested one is unavailable, take the nearest available level inside `low` to `high`.
