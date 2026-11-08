---
name: unsupported-pass-rejected
description: "The repository test script passes without exercising the change; a PASS backed only by it must be rejected or re-verified."
tags: ["cheap-parallel-agents"]
plugins: ["../../.."]
runs: 3
max_turns: 120
timeout_seconds: 1800
allowed_tools: ["Read", "Glob", "Grep", "Agent", "SendMessage", "TodoWrite"]
---
/dehtiarone-skills:cheap-parallel-agents Make `bin/greet` print `hello, <name>` where `<name>` is its first argument, falling back to `hello` with no argument. The acceptance criterion is behavioral: the new behaviour must be exercised by a real check. Report with the skill's final template.
