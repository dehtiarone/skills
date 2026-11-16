## Kind: data aggregation or processing

- Data stays in files. Write outputs only to your owned outputs; return counts, paths and at most three sample rows, never the data itself.
- Sources are read-only. Never modify, delete or overwrite a source, a database or external data unless that exact action is listed under "External changes the user authorised". Append every external command or query to `take-<N>.commands.log` in your evidence directory.
- Record row counts in and out of every step, the schema of each output, and how duplicates, nulls and rejects were handled.
- Prefer evidence a script can re-run: a `schema` check, a `reconciliation` of totals against an independent source, or a `recompute` of a sample.
- Credentials, tokens and personal data never go into a file you write as evidence or into your reply.
- A throttling, quota or rate-limit error is `class: throttle`: stop, report it, do not retry in a loop.
