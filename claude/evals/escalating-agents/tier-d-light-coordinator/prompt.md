---
name: tier-d-light-coordinator
description: "The tier D case with the coordinator pinned to Haiku: cheap low first attempts and two validators under a light parent."
tags: ["escalating-agents-light"]
plugins: ["../../.."]
model: haiku
runs: 3
max_turns: 160
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Add a `tenant_id INTEGER NOT NULL` column to `users` in `db/schema.sql` so that `db/checks/check_schema.sh` passes. This changes a shared production schema used for tenant isolation: treat it with the care the skill prescribes. Report with the skill's final report.
