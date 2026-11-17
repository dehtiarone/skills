---
name: snapshot-order-before-validate
description: "Every worker result is recorded, and the batch closed, before a validator is dispatched; the report follows validation."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, world` and `bin/farewell` print `goodbye`, updating `test/run.sh` through a single owner. Report with the skill's final report.
