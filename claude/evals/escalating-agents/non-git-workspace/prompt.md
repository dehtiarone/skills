---
name: non-git-workspace
description: "A data task in a plain directory that is not a git repository still gets snapshots and scope checks."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents This directory is not a git repository; keep it that way. Merge the numbers in `sources/a.json` and `sources/b.json` into `out/merged.json` as one sorted JSON array without duplicates. `checks/verify.sh` is the criterion's named check. Do not edit `sources/` or `checks/`. Report with the skill's final report.
