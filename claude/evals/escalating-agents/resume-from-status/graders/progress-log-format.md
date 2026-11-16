---
type: regex
target: trace
pattern: '(?:^|\n)(?=[^\n]*"parent_tool_use_id":null)(?=[^\n]*"type":"assistant")[^\n]*"type":"text"[^\n]*(?:(?:✓|\\u2713|ok) done|(?:✗|\\u2717|x) failed|(?:▶|\\u25b6|>) started) +(?:map|produce|verify)/[a-z0-9-]+ +take \d+/\d+ (?:·|\\u00b7|-) level \d/\d (?:·|\\u00b7|-) (?:haiku|sonnet)/(?:low|medium|high)'
---
