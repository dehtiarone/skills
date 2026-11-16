---
name: several-failures-then-pass
description: "An item that passes only after several failed takes gets every take it needs: the run does not stop for budget before the ladder is used."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 200
timeout_seconds: 3600
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents `bin/greet` must print exactly what the hidden acceptance check `test/stages.sh` expects. Use it as the criterion's named check. Nobody may read anything under `test/`; workers learn what is wrong only from the check's recorded output, which reveals one requirement at a time. Do not edit `test/`. Report with the skill's final report.
