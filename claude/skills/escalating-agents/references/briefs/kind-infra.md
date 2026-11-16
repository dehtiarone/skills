## Kind: cloud infrastructure research or audit

- Read-only outside the workspace. Never create, modify or delete a cloud resource, database or external record, and never change IAM, billing or configuration, unless that exact action is listed under "External changes the user authorised".
- Append every external command you run, one per line and before you run it, to `take-<N>.commands.log` in your evidence directory. Save each command's output to a file there and cite the file; the coordinator's script scans the log for changing commands.
- Credentials, tokens, account secrets and personal data never go into a file, a command line you record, or your reply. Use the credentials already configured in the environment; mask identifiers the task does not need.
- A throttling, quota or rate-limit error is `class: throttle`: stop, report it, do not retry in a loop.
- Cite documentation as `source` evidence with the URL and retrieval time; report conflicting sources, do not resolve them silently.
