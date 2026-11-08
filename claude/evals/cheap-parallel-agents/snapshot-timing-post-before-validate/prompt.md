---
name: snapshot-timing-post-before-validate
description: "pre-1 is captured before the implement batch, post-N after all writers stop and before any validator, and final before acceptance."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Make `bin/greet` print `hello, world` and `bin/farewell` print `goodbye`, updating `test/run.sh` through a single owner. Report with the skill's final template, including the snapshot names each record was checked against.
