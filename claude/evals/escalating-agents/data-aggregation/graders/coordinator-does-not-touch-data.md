---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"(?:Bash|Read)")[^\n]*sources/[a-z]+\.(?:csv|json)'
match: not_contains
---
