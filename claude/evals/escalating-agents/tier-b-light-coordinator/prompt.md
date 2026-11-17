---
name: tier-b-light-coordinator
description: "The tier B parallel case with the coordinator pinned to Haiku: the skill must hold under a light parent."
tags: ["escalating-agents-light"]
plugins: ["../../.."]
model: haiku
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents In this repository make two changes: `bin/greet` must print `hello, world` and `bin/farewell` must print `goodbye, world`. Update `test/run.sh` expectations accordingly; only one worker may own the test file. Report with the skill's final report.
