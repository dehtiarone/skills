---
name: unavailable-pinning-effort-env
description: "With CLAUDE_CODE_EFFORT_LEVEL set in the runner, the override is disclosed in the first progress line and stops dispatch until the user accepts it; the acceptance is recorded and the report says so."
tags: ["escalating-agents-pinning"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, world` and update `test/run.sh`. If the skill reports that the host overrides the model or effort of subagents, I accept that for this run: continue with what the host runs. Report with the skill's final report.
