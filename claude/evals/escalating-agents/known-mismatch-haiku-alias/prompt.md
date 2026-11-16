---
name: known-mismatch-haiku-alias
description: "With ANTHROPIC_DEFAULT_HAIKU_MODEL set in the runner, the alias override is disclosed and the report says Known mismatch; the run continues."
tags: ["escalating-agents-pinning"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/farewell` print `goodbye, world` and update `test/run.sh`. Report with the skill's final report.
