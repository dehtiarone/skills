---
name: tier-b-parallel-two-items
description: "Two independent edits in separate files run as one parallel batch of two cheap low-effort workers, then one fresh validator."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents In this repository make two changes: `bin/greet` must print `hello, world` and `bin/farewell` must print `goodbye, world`. Update `test/run.sh` expectations accordingly; only one worker may own the test file. Report with the skill's final report.
