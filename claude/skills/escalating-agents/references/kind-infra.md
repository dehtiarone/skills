# Kind: cloud infrastructure research or audit

Load before planning an infra task.

- The workspace is a directory for the outputs (report, findings table, saved command output). It need not be a git repository.
- Everything outside the workspace is read-only. A worker may create, modify or delete a resource, or touch IAM or billing, only for an action you listed with an `allow` plan line because the user explicitly authorised exactly that. The script scans recorded commands and each worker's command log for changing verbs and reports what it finds. The scan is a heuristic: it can miss a changing command and can flag a read-only one (`start-query`), so a flag means review, and no flag is not proof.
- Credentials never go into a plan line, a brief or the report. Workers use what the environment already provides. The report step scans the run files for secret values from the environment.
- Map items first: which accounts, regions and services are in scope, which CLI and identity are available, and the rate limits or quotas of each API. Put a known limit into the plan as `limit <n>`; it caps the batch width. A throttling error is an environment failure: the script halves the width and retries at the same level, and it never raises effort or model for it.
- Split by account, region or service so each item owns one output file and can run in parallel.
- Criteria: `command-output` for a fact read from a system (the saved output must contain the quoted line), `source` for a documented fact (URL, retrieval time, saved copy), `recompute` for a number derived from saved output, `inspection` only for the wording of the report.
- Findings are verified by re-running a sample of the commands, not by reading the producer's summary. Conflicting sources are reported as conflicting.
- Recommendations someone will act on, security findings and anything using production credentials are tier D.
