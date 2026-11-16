# Pinning on Codex: requested, configured, observed

Read this when `spawn_agent` hides or rejects `model` or `reasoning_effort`, or a worker ran on other settings than requested.

Every call has three facts: what the brief requested, what the configuration allows, and what the host shows afterwards. The report gives one verdict: **Verified** (the host showed matching settings), **Requested but unverified** (overrides were sent, effective settings are not shown), **Known mismatch** (an override, cap or forced setting changes execution). Disclose a Known mismatch to the user at once, continue as best effort, and never report "no mismatch observed" as "guarantees held".

Look at your own `spawn_agent` tool schema once, before the first dispatch.

| Situation | Effect on workers | What to do |
| --------- | ----------------- | ---------- |
| The schema accepts `model` and `reasoning_effort` | Per-call pinning works for spawns with `fork_turns: "none"` | Send both on every spawn; record what ran with `--ran` when the host shows it |
| The schema hides them, or the backend rejects the override | Workers inherit the configured default; the effort ladder collapses to fresh takes with corrections | Run `LEDGER pinning TASK mismatch "<what is hidden or rejected>"`, show the configuration below once, and continue |
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

A role file may need further fields in your Codex version (a name, a description, instructions); the two keys above are the ones this skill depends on. A spawn selects a role through the spawn tool's agent-type field where the schema has one. A role fixes one model and one effort, so a full ladder without per-call overrides needs one role per level. The `hide_spawn_agent_metadata` feature flag is version-dependent. Configuration files are evidence of configuration only: profiles and startup overrides may differ from what a session runs.

Both worker models accept `low`, `medium` and `high`. The model catalogue gives `gpt-6.1-terra` a default multi-agent effort above `high`, so the level 4 spawn must carry `reasoning_effort` explicitly; if the host drops it, that is a Known mismatch. A host-forced effort above `high` or below `low` is a Known mismatch: record it with `LEDGER pinning TASK mismatch "…"`; never request one. The report says **Verified** only when every `result` carried a `--ran` equal to the request. If a fallback effort must be chosen because the requested one is unavailable, take the nearest available level inside `low` to `high`.
