---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"name":"Agent")(?=[^\n]*"model":\s*"sonnet")[^\n]*Item: ([a-z0-9-]+) \|(?<!produce/\1 [^\n]*gate 6/6[\s\S]*)'
match: not_contains
---
