---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")[^\n]*"name":"(?:Grep|Glob)"'
match: not_contains
---
