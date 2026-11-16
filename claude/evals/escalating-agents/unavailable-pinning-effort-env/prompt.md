---
name: unavailable-pinning-effort-env
description: "With CLAUDE_CODE_EFFORT_LEVEL set in the runner, the override is disclosed in the first progress line and the report says Known mismatch; the run continues."
tags: ["escalating-agents-pinning"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, world` and update `test/run.sh`. Report with the skill's final report.
