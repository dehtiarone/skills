---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Agent")[^\n]*Stage: Produce \| Item: [a-z0-9-]+ \| Take: [2-9][\s\S]*?(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Agent")[^\n]*Stage: Verify \| Item: '
---
