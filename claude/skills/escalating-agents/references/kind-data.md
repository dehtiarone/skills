# Kind: data aggregation or processing

Load before planning a data task.

- The workspace is the output directory. Point it at the outputs, not at a large raw-data store: every snapshot hashes the whole workspace. Sources stay outside it and are read-only.
- Data never enters your context. Workers write files and return counts, paths and at most three sample rows; you never open a data file, and verification reads files, not your memory.
- Map items first: where each source is, its format and size, its key columns, its rate limits or query cost. Put a known limit into the plan as `limit <n>`.
- Split by source or by transformation step so each item owns one output file: collect per source in parallel, then one item to join, one to aggregate. Give a later step `after:` the steps it consumes, and give steps that write to the same database, cache or scratch area the same `locks:` name.
- Criteria: `schema` for the shape of an output, `reconciliation` for totals or counts that must match an independent source, `recompute` for a sample re-derived independently, `behavioral` for a pipeline command that must run clean. Give each one a `check:` command when the request names an expected total or a validation script.
- A verifier re-derives a sample of the numbers from the sources or re-runs a sample of the queries. It also checks method: duplicates, nulls, joins that drop or multiply rows, and totals that only match by accident.
- Personal data, financial totals and numbers a decision will rest on are tier D.
- Database writes, deletes and overwrites of a source need an `allow` line backed by the user's explicit authorisation.
