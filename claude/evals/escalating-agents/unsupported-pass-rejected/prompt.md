---
name: unsupported-pass-rejected
description: "A vacuous suite cannot stand in for a behavioural criterion: acceptance rests on a check that runs the new behaviour, and a low-effort validator cannot wave the work through."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, <name>` where `<name>` is its first argument, falling back to `hello` with no argument. The acceptance criterion is behavioral: the new behaviour must be exercised by a real check. Report with the skill's final report.
