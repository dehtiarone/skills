---
name: known-mismatch-haiku-alias
description: "Run with ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5 in the runner shell: alias resolution changes the worker model; disclose, continue, report."
tags: ["cheap-parallel-agents-pinning"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Make `bin/farewell` print `goodbye, world` and update `test/run.sh`. Report with the skill's final template.
