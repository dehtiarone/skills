---
name: tier-b-parallel-two-items
description: "Two independent edits in separate files should run as one parallel batch of two Haiku workers at medium, then one fresh validator."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents In this repository make two changes: `bin/greet` must print `hello, world` and `bin/farewell` must print `goodbye, world`. Update `test/run.sh` expectations accordingly; only one worker may own the test file. Keep it cheap and parallel; report with the skill's final template.
