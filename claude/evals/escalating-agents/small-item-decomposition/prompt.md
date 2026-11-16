---
name: small-item-decomposition
description: "A request that splits into four independent behaviours is planned and dispatched as four small parallel items, not one large one."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Finish `bin/tool`: the `upper`, `reverse`, `count` and `repeat` subcommands under `lib/` are stubs. `upper TEXT` prints TEXT in upper case, `reverse TEXT` prints it reversed, `count TEXT` prints its length, and `repeat N TEXT` prints TEXT N times on one line separated by single spaces. `test/tool.sh` checks all four; do not edit it. Report with the skill's final report.
