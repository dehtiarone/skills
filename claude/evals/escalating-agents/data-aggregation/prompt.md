---
name: data-aggregation
description: "Four data sources are aggregated by parallel workers; a hidden reconciliation check must hold, and the coordinator never touches the raw data."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 200
timeout_seconds: 3000
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents Aggregate the four regional sales files under `sources/` into `out/totals.csv`: a header `region,units,revenue`, one row per region, and a final `TOTAL` row. An order exported twice (same `order_id`) counts once. Revenue has two decimals. `checks/reconcile.sh` is a hidden reconciliation check: only validators run it and producers must not read it. Do not edit `sources/` or `checks/`. Report with the skill's final report.
