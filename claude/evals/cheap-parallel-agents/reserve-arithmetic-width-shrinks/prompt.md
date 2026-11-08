---
name: reserve-arithmetic-width-shrinks
description: "Five independent items under tier B budget 7 cannot all be dispatched: admission (M + U + V + 1 + V <= remaining) forces merging items."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Cheaply: five independent changes, each of `bin/one`, `bin/two`, `bin/three`, `bin/four`, `bin/five` must print its name in upper case (`ONE`, ...). They are trivially independent; treat this as a tier B change and do not promote the tier. Report with the skill's final template, including the ledger.
