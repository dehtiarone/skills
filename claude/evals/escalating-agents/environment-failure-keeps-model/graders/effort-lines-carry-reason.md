---
type: regex
target: trace
pattern: '(?:↑|\\u2191|\^) effort +\S+ +level \d(?:→|\\u2192|->)\d (?:·|\\u00b7|-) [a-z0-9.-]+/[a-z]+ (?:→|\\u2192|->) [a-z0-9.-]+/[a-z]+(?:\\n|"|$)'
match: not_contains
---
