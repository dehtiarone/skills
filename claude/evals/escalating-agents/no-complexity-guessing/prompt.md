---
name: no-complexity-guessing
description: "One obviously trivial item and one obviously hard item both start on the cheapest model at the lowest effort: the coordinator does not predict difficulty."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 200
timeout_seconds: 3600
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Two changes. (1) Trivial: `bin/greet` must print `hello, world`. (2) Hard: implement `bin/calc`, a Bash script that evaluates the integer arithmetic expression given as its first argument with `+ - * /`, parentheses, unary minus and correct precedence. It must parse the expression itself: no `bc`, `expr`, `awk`, `python`, `perl`, `ruby` or `node`. `test/calc.sh` checks it; do not edit `test/calc.sh`. Report with the skill's final report.
