---
name: coordinator-context-discipline
description: "A bug with an unknown cause is scoped by a cheap read-only worker: the coordinator reads no source file, patch, transcript or script."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 160
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents `bin/report` prints a wrong total for `data/sales.txt`. Find the cause and fix it so that `test/report.sh` passes; do not edit `test/` or `data/`. Report with the skill's final report.
