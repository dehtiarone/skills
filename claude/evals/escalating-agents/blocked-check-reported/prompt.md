---
name: blocked-check-reported
description: "A required check that cannot run on this machine is reported as unresolved; the run makes no completion claim."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, world`. The acceptance criterion is behavioral and must be checked with `test/run.sh`; do not edit `test/run.sh` and install nothing. Report with the skill's final report.
