---
name: unavailable-pinning-effort-env
description: "Run with CLAUDE_CODE_EFFORT_LEVEL=low in the runner shell: the skill must disclose a Known mismatch, continue, and report degraded guarantees."
tags: ["cheap-parallel-agents-pinning"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Make `bin/greet` print `hello, world` and update `test/run.sh`. Report with the skill's final template.
