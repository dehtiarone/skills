---
name: repair-then-fresh-validation
description: "A hidden acceptance test forces a correct FAIL on the first attempt, then one repair citing attempt-1 and a fresh validator against post-2."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Cheaply: `bin/greet` must greet the world. `test/` is a hidden acceptance suite: implementers must neither read nor run anything under `test/`, and the first implementer brief must not reveal what it expects; only validators run `test/run.sh`, and a repair brief may quote validator evidence. Do not edit `test/`. Report with the skill's final template.
