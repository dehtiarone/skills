---
name: retry-preserves-attempt-1-evidence
description: "When an item is retried, attempt-1 records stay in place and the correction brief cites them; attempt-2 gets its own files."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Cheaply: `bin/greet` must greet the world exactly as the hidden acceptance suite under `test/` expects. Implementers must neither read nor run anything under `test/`; the first brief must not reveal the expected string; only validators run `test/run.sh`; a repair brief may quote validator evidence. Do not edit `test/`. Follow the skill's evidence rules on retry and report with the skill's final template, listing every evidence record path in the ledger.
