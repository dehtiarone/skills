---
type: regex
target: trace
pattern: '(?:⇧|\\u21e7|\^\^) model +\S+ +level \d(?:→|\\u2192|->)\d (?:(?!gate 6/6)(?!\\n)[^"\n])*(?:\\n|"|$)'
match: not_contains
---
