# Pinning on Codex: requested, configured, observed

Read this when `spawn_agent` hides or rejects `model` or `reasoning_effort`, or a worker ran on other settings than requested.

Every call has three facts: what the brief requested, what the configuration allows, and what the host shows afterwards. The report gives one verdict: **Verified** (the host showed the requested effort and a model ID of the required generation for every call), **Requested; model generation unverified** (the host showed only the alias), **Requested but unverified** (overrides were sent, effective settings are not shown), **Known mismatch** (an override, cap or forced setting changes execution). Never report "no mismatch observed" as "guarantees held".

**A Known mismatch stops the run.** This skill's workers are the two listed models at `low`, `medium` or `high`, nothing else. When the host is known to run them on another model or another effort, the script refuses every dispatch. Tell the user what was found and the remedy from the table; do not change configuration yourself. Then either the user corrects the configuration and you start a new run, or the user explicitly accepts the deviation and you record their words: `LEDGER pinning TASK accept "<what the user said>"`. The run continues in a relaxed mode that the log and the report label as such. "Requested but unverified" is not a mismatch and does not stop anything.

Look at your own `spawn_agent` tool schema once, before the first dispatch.

| Situation | Effect on workers | What to do |
| --------- | ----------------- | ---------- |
| The schema accepts `model` and `reasoning_effort` | Per-call pinning works for spawns with `fork_turns: "none"` | Send both on every spawn; record what ran with `--ran` when the host shows it |
| The schema hides them, or the backend rejects the override | Workers inherit the configured default: the ladder cannot run | Run `LEDGER pinning TASK mismatch "<what is hidden or rejected>"`, show the user the configuration below, and stop until they decide |
| A worker is shown to have run on other settings (`--ran`) | The request was overridden | The script records the mismatch itself and stops dispatching |
| A spawn with full history (`fork_turns: "all"`) | Overrides are rejected; the worker inherits your model | Never use it |
| Workers appear that you did not dispatch | They are outside the ledger. Local Codex delegates only on a direct request or an applicable project or skill instruction; proactive delegation at Ultra is a ChatGPT Work behaviour, not a local Codex one | Say so; treat budget, usage and snapshot statements as incomplete for those workers |

Configuration a user can add when per-call overrides are unavailable. Show it; never edit configuration yourself and never start a nested CLI:

```toml
# ~/.codex/config.toml or .codex/config.toml
[agents]
default_subagent_model = "gpt-6-luna"
default_subagent_reasoning_effort = "low"
```

```toml
# .codex/agents/luna_low.toml: a custom agent for level 1 workers
name = "luna_low"
description = "Cheap worker for one escalating-agents item at low effort."
model = "gpt-6-luna"
model_reasoning_effort = "low"
developer_instructions = """
Read the brief file named in your task completely, then do exactly what it says. Reply in at most 10 lines.
"""
```

```toml
# .codex/agents/terra_high.toml: a custom agent for the gated level 4 take
name = "terra_high"
description = "Escalated worker for one escalating-agents item at high effort."
model = "gpt-6.1-terra"
model_reasoning_effort = "high"
developer_instructions = """
Read the brief file named in your task completely, then do exactly what it says. Reply in at most 10 lines.
"""
```

Every custom agent file must define `name`, `description` and `developer_instructions`; `model` and `model_reasoning_effort` are optional there and are the two keys this skill depends on (Codex subagent documentation, read 2026-11-16). Codex identifies a custom agent by its `name`, and the documentation shows a parent selecting one by naming it in the request; it documents no agent-type parameter on the spawn tool, so do not invent one. A custom agent fixes one model and one effort, so a full ladder without per-call overrides needs one per level (`luna_low`, `luna_medium`, `luna_high`, `terra_high`). With custom agents in place the run is still a Known mismatch until the user accepts it, because the script cannot see which agent a spawn really used.

Not verified: a `hide_spawn_agent_metadata` setting was seen in Codex client 0.169.0 but is not in the public configuration reference, and no minimum Codex version for these tools is documented; treat both as version-dependent. Configuration files are evidence of configuration only: profiles and startup overrides may differ from what a session runs.

Both worker models accept `low`, `medium` and `high`. The model catalogue gives `gpt-6.1-terra` a default multi-agent effort above `high`, so the level 4 spawn must carry `reasoning_effort` explicitly; if the host drops it, that is a Known mismatch. A host-forced effort above `high` or below `low`, or a forced model other than the two listed, is a Known mismatch: record it with `LEDGER pinning TASK mismatch "…"`; never request one. The report says **Verified** only when every `result` carried a `--ran` equal to the request.
