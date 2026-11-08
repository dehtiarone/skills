---
type: tool_order
before: {"tool": "Bash", "input_match": "agent-snapshot\\.sh\\\\?[\"\\']?\\s+capture\\s+(?:\\\\\"[^\"]*\"|\\'[^\\']*\\'|\\S+)\\s+post-\\d+"}
after: {"tool": "Agent", "input_match": "Stage: Validate"}
---
