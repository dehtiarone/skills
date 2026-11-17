---
name: retry-preserves-take-1-evidence
description: "A retry is a new take with its own records: take 1 stays on file and the ledger lists both."
tags: ["escalating-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 2400
allowed_tools: ["Read", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:escalating-agents `bin/greet` must greet the world exactly as the hidden acceptance suite under `test/` expects. Producers must neither read nor run anything under `test/`; no plan line or first brief may reveal the expected string; only validators run `test/run.sh`; a repair may use validator evidence. Do not edit `test/`. Report with the skill's final report, including the ledger.
