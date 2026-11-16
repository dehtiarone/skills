---
type: tool_order
before: {"tool": "Bash", "input_match": "ledger\\.sh\\\\?[\"\\x27]?\\s+status\\b"}
after: {"tool": "Bash", "input_match": "ledger\\.sh\\\\?[\"\\x27]?\\s+dispatch\\b"}
---
