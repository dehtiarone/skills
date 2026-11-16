---
name: same-failure-stops-early
description: "The same failure at every level and after narrowing stops the item through no-progress detection, long before the budget runs out and without a model change."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 160
timeout_seconds: 3000
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents `bin/greet` must satisfy the hidden acceptance check `test/impossible.sh`. Use it as the criterion's named check. Nobody may read anything under `test/`; workers learn what is wrong only from the check's recorded output. Do not edit `test/`. There is no one to answer questions in this run. Report with the skill's final report.
