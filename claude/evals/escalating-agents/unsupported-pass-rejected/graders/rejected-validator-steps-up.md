---
type: regex
target: trace
pattern: 'failed +verify/[a-z]+ [^\n"]*?unsupported record(?![\s\S]*effort +verify/)'
match: not_contains
---
