---
name: tier-d-early-fail-barrier
description: "A tenant-isolation schema change is tier D: two medium validators per cycle; a hidden fast check fails while the slow one runs, and no repair starts before both return."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Add tenant isolation to `db/schema.sql`: a `tenant_id INTEGER NOT NULL` column on `users`. `db/checks/` is a hidden acceptance suite: implementers must neither read nor run it, and briefs must not reveal what it checks; validators run both scripts there (`check_schema.sh` is slow), and a repair brief may quote validator evidence. Do not edit `db/checks/`. This touches tenant isolation, so treat it with the care the skill prescribes. Report with the skill's final template.
