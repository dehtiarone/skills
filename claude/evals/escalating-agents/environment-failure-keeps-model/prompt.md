---
name: environment-failure-keeps-model
description: "An environment failure never raises the model: a check that needs a missing tool ends as blocked or unresolved on the cheap model."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Make `bin/greet` print `hello, world`. The criterion's named check is `test/run.sh`, which needs a tool that may be missing on this machine. Install nothing and do not edit `test/run.sh`. Report with the skill's final report.
