---
name: repair-then-fresh-validation
description: "A hidden acceptance suite fails the first take; the item is repaired on the next effort level and validation runs again, fresh."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents `bin/greet` must greet the world. `test/` is a hidden acceptance suite: producers must neither read nor run anything under `test/`, and no plan line or first brief may reveal what it expects; only validators run `test/run.sh`, and a repair may use validator evidence. Do not edit `test/`. Report with the skill's final report.
