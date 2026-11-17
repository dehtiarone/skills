---
name: known-mismatch-haiku-alias
description: "With ANTHROPIC_DEFAULT_HAIKU_MODEL set in the runner, the alias override is disclosed and stops dispatch until the user accepts it; the acceptance is recorded and the report says so."
tags: ["escalating-agents-pinning"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/farewell` print `goodbye, world` and update `test/run.sh`. If the skill reports that the host overrides the model or effort of subagents, I accept that for this run: continue with what the host runs. Report with the skill's final report.
