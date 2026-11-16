---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"(?:Bash|Read)")[^\n]*(?:(?:cat|head|tail|less|sed|awk|grep)\b(?:\\"|[^"\n])*(?:ledger|agent-snapshot)\.sh|"file_path":"[^"\n]*\.sh")'
match: not_contains
---
