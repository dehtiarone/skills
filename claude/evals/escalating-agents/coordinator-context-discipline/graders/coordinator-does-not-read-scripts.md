---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"(?:Bash|Read)")[^\n]*(?:(?:cat|head|tail|less|more|sed|awk|grep|rg)\s+(?:-[^\s"\\]+\s+)*(?:[0-9,p$]+\s+)?(?:\\"|\x27)?[^\s"\\\x27]*(?:ledger|agent-snapshot)\.sh|"file_path":"[^"\n]*\.sh")'
match: not_contains
---
