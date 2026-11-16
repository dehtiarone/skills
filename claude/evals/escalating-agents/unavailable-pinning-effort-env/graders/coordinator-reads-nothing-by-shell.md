---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Bash")(?![^\n]*ledger\.sh)[^\n]*"command":"(?:\\"|[^"\n])*?\b(?:cat|head|tail|less|more|sed|awk|grep|rg|find|git diff|git show|git log)\b'
match: not_contains
---
