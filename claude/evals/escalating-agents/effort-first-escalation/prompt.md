---
name: effort-first-escalation
description: "A seeded shortfall moves the item to the next effort level on the same cheap model, with no model change."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents `bin/greet` must print exactly what `test/run.sh` expects. Use `test/run.sh` as the criterion's named check. Producers must not read or run anything under `test/`, and no plan line or first brief may reveal the expected text; a repair may use the check's recorded output. Do not edit `test/`. Report with the skill's final report.
