---
type: regex
target: {"source": "file", "path": "tools/aws-calls.log"}
pattern: '(?:^|\n)(?:s3api|s3|ec2|iam|sts) (?:create|delete|put|update|modify|rb|mb|rm|cp|mv|sync)\b'
match: not_contains
---
