---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?:(?=[^\n]*"name":"Read")[^\n]*"file_path":"[^"\n]*sources/|(?=[^\n]*"name":"Bash")(?![^\n]*ledger\.sh)[^\n]*sources/)'
match: not_contains
---
