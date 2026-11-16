---
name: wide-dispatch-follows-capacity
description: "Six independent items go out in one batch wider than the former cap of four: width follows capacity and admission."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Six independent changes: each of `bin/one`, `bin/two`, `bin/three`, `bin/four`, `bin/five` and `bin/six` must print its own name in upper case (`ONE`, ...). They share nothing. Report with the skill's final report.
