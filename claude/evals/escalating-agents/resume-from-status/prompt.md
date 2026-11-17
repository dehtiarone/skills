---
name: resume-from-status
description: "State is restored from the task directory: the status command is used before dispatching, as after a lost context."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, world` and `bin/farewell` print `goodbye, world`; `test/run.sh` must be updated by a single owner. Treat your own memory as unreliable in this run: before every dispatch, restore your state from disk the way the skill prescribes for a lost context. Report with the skill's final report.
