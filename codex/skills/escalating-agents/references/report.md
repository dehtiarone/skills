# Final report

`LEDGER report TASK` captures a fresh snapshot of the workspace every time it runs, compares it with the validated state, scans the run files for secrets and for commands that may change external systems, writes `TASK/report.md` and prints it. Relay it as your final message. Pass `--external "<what was actually done>"` for commits, pushes, deployments or authorised external changes, and `--usage "<measured tokens or cost>"` when the host exposes them.

```text
Tier: [A/B/C/D, and the tier it was promoted from]
Kind: [code/infra/data]
Coordinator: [parent model/effort as given to init]
Outcome: [items accepted, unresolved, units used of budget; state: complete, incomplete (why), or INVALID when the workspace changed after validation]
Ledger: [stage/item | take | level | requested | ran | batch | elapsed | outcome | class | failure | units]
Pinning: [Verified / Requested; model generation unverified / Requested but unverified / Known mismatch with cause, and the user's words if they accepted it; calls shown exactly, by alias only, on other settings]
Parallelism: [batches | peak concurrent | elapsed per batch | no savings claim without a serial baseline]
Effort distribution (requested): [cheap low / medium / high; expensive]
Escalations: [effort steps; model steps, each with its escalation.md]
Verified: [criterion | result | evidence type | who verified it on which snapshot | check fixed by plan or worker]
Check basis: [criteria that are PROVISIONAL: passed only on a check a worker chose, or on output a worker saved; criteria accepted by inspection only]
Choices: [decisions]
Unresolved checks/work: [items stopped or unverified, or none]
Workspace: [validated snapshot; changes after validation; accepted changes outside any dispatch; files written by checks the script re-ran]
External actions: [as reported; commands the script ran, refused to run, and flagged in worker records]
Not covered by snapshots: external systems, ignored files
Secrets: [produced files that hold a detected secret (blocks acceptance); evidence a value was withheld from; files that hold one; detection is not a guarantee]
Usage: [measured, or unavailable]
Post-acceptance defects: not assessed
Run files: [TASK]
```

Rules for what you add around it:

- Report requested settings as requested; "no mismatch observed" is not "guarantees held".
- Make no time or cost savings claim without a measured serial baseline.
- Report actual external actions, not what was authorised.
- If `Secrets` lists files, tell the user before sharing anything from `TASK`.
- `state: complete` is the only success. `PROVISIONAL` means every item was accepted but the listed criteria were not independently checked (a check a worker chose, or output a worker saved): say exactly that, never "done". Relay `incomplete` and `INVALID` as they are. If `report` exits non-zero the workspace could not be compared with the validated state: nothing is known about it.
