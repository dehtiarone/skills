# Final report

`LEDGER report TASK` captures the final snapshot, scans the run files for secrets and for commands that may change external systems, writes `TASK/report.md` and prints it. Relay it as your final message. Pass `--external "<what was actually done>"` for commits, pushes, deployments or authorised external changes, and `--usage "<measured tokens or cost>"` when the host exposes them.

```text
Tier: [A/B/C/D, and the tier it was promoted from]
Kind: [code/infra/data]
Coordinator: [parent model/effort as given to init]
Outcome: [items accepted, unresolved, units used of budget]
Ledger: [stage/item | take | level | requested | ran | batch | elapsed | outcome | class | failure | units]
Pinning: [Verified / Requested but unverified / Known mismatch with cause; calls that ran on other settings]
Parallelism: [batches | peak concurrent | elapsed per batch | no savings claim without a serial baseline]
Effort distribution (requested): [cheap low / medium / high; expensive]
Escalations: [effort steps; model steps, each with its escalation.md]
Verified: [criterion | result | evidence type | who verified it on which snapshot]
Choices: [decisions]
Unresolved checks/work: [items stopped or unverified, checks not run, or none]
Workspace: [validated snapshot; changes after validation; changes between batches outside any dispatch]
External actions: [as reported; count of possibly changing commands found by the scan]
Not covered by snapshots: external systems, ignored files
Secrets: [none found, or the files to redact; values are never printed]
Usage: [measured, or unavailable]
Post-acceptance defects: not assessed
Run files: [TASK]
```

Rules for what you add around it:

- Report requested settings as requested; "no mismatch observed" is not "guarantees held".
- Make no time or cost savings claim without a measured serial baseline.
- Report actual external actions, not what was authorised.
- If `Secrets` lists files, tell the user before sharing anything from `TASK`.
