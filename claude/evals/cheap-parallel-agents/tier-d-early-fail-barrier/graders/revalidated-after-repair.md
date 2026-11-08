---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Agent")[^\n]*Stage: Implement \| Item: [^|\n]+ \| Attempt: 2\b[\s\S]*?(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Bash")[^\n]*agent-snapshot\.sh[^\n]*?capture[^\n]*?post-\d+[\s\S]*?(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Agent")[^\n]*Stage: Validate \| Item: [^|\n]+ \| Attempt: [2-9]\b'
---
