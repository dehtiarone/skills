---
type: regex
target: trace
pattern: 'gate [0-6]/6(?![\s\S]*1\. (?:PASS|FAIL) [\s\S]*3\. (?:PASS|FAIL) [^\n"]*failure class[\s\S]*4\. (?:PASS|FAIL) [^\n"]*independent confirmation[\s\S]*5\. (?:PASS|FAIL) [^\n"]*narrowing)'
match: not_contains
---
