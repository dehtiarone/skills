---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"name":"Agent")(?=[^\n]*"id":"(msg_\w+)")[^\n]*Stage: Produce[^\n]*(?:(?:\n[^\n]*)*?\n(?=[^\n]*"name":"Agent")(?=[^\n]*"id":"\1")[^\n]*Stage: Produce[^\n]*){1}'
---
