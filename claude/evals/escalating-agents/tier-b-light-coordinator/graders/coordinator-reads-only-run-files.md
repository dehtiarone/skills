---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"tool_use")(?=[^\n]*"name":"Read")(?![^\n]*"file_path":"[^"\n]*(?:/references/[a-z-]+\.md|/task\.[A-Za-z0-9]+/[^"\n]*\.(?:md|tsv|txt)|/SKILL\.md)")[^\n]*"file_path"'
match: not_contains
---
