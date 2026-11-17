---
name: overlapping-ownership-serialises
description: "Two changes to the same file cannot run in one batch: ownership is declared in the plan and both behaviours still land."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents As cheaply and quickly as possible, two changes: (1) `bin/greet` must accept an optional first argument and print `hello, <arg>` when given, `hello` otherwise; (2) `bin/greet` must also print a second line `--` after the greeting. Update `test/run.sh` to cover both. Report with the skill's final report.
