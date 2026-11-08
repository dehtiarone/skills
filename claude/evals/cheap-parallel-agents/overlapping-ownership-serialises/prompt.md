---
name: overlapping-ownership-serialises
description: "Two requested changes touch the same file; they must be merged into one item or serialised, never two concurrent writers."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents As cheaply and quickly as possible, two changes: (1) `bin/greet` must accept an optional first argument and print `hello, <arg>` when given, `hello` otherwise; (2) `bin/greet` must also print a second line `--` after the greeting. Update `test/run.sh` to cover both. Report with the skill's final template.
