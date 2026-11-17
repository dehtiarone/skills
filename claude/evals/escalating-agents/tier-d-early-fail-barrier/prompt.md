---
name: tier-d-early-fail-barrier
description: "A tenant-isolation schema change is tier D: two low-effort validators per cycle, dispatched together; a hidden fast check fails while the slow one runs, and the repair waits for both."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 200
timeout_seconds: 3000
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Add tenant isolation to `db/schema.sql`: a `tenant_id INTEGER NOT NULL` column on `users`. `db/checks/` is a hidden acceptance suite: producers must neither read nor run it, and no plan line or first brief may reveal what it checks; validators run both scripts there (`check_schema.sh` is slow), and a repair may use validator evidence. Do not edit `db/checks/`. This touches tenant isolation on shared production data, so treat it with the care the skill prescribes. Report with the skill's final report.
