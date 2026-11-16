# Evidence types and records

A criterion is one line: an ID (`C1`), one evidence type, what must be true, and optionally a named check. Write criteria before dispatching; producers and validators receive the same ones.

A record satisfies a criterion only with the criterion's own type. Weaker evidence never satisfies a stronger criterion: a `parse` check proves the file parses and nothing more, and reading a diff never stands in for running the code.

| Type | Proves | How the script verifies the record | Typical use |
| ---- | ------ | ---------------------------------- | ----------- |
| `behavioral` | Executed test, build or run exercises the result | Re-runs the command; it must exit 0 and print the quoted output line | Code; a pipeline run |
| `recompute` | An independent re-derivation of a sample gives the same result | Re-runs the comparison command | Data; numbers in findings |
| `reconciliation` | Totals or counts match an independent source | Re-runs the comparison command | Data |
| `schema` | An output validates against the expected shape | Re-runs the validation command | Data; generated config |
| `static` | Type-check or lint passes | Re-runs the command | Code |
| `parse` | The file parses | Re-runs the command | Code; config |
| `format` | The formatter reports no change | Re-runs the command | Code |
| `command-output` | A read-only CLI or API call returned this | The saved output exists and contains the quoted line; the command is scanned for changing verbs | Infra research |
| `source` | A document says this | The saved copy contains the quoted line; URL and retrieval time are present | Research |
| `inspection` | A file contains this at this place | The cited file contains the quoted line | Wording, layout, patch review |

For each task kind prefer the type highest in the table that the work allows.

## What the script rejects

A record is rejected, and its worker's take counts as an ordinary failure, when any block has: a type other than the criterion's; a PASS whose command does not exit 0 (the worker does not choose what success looks like; wrap an expected failure as `! command`); a command that only prints fixed text (`echo ok`, `true`); a command that could not start; a command that may change an external system, which the script refuses to run; no output, or output without the quoted decisive line; a FAIL whose command passes; `NOT_RUN` without `class: environment` and a reason; a missing block for one of the item's criteria; a check or expected text fixed in the plan that does not hold. A producer's `NOT_RUN` fails its take; a validator's `NOT_RUN` on a required criterion blocks acceptance until the check can run.

## What the script cannot judge

The script proves that a command ran, exited 0 and printed the quoted line. Whether the command exercises the criterion is a judgment it cannot make, beyond refusing fixed text. A check fixed in the plan (`check:`, `expect:`) binds the criterion to something the coordinator, the user or a map report chose before production; without one, the criterion rests on a check the validator chose. The report says which is which under `Check basis`, and never calls the second kind more than it is. In tier A, which has no validator, every criterion must carry such a `check:` in the plan. A missing report or record file is the same failure. A rejected validator moves up one level and a fresh validator is dispatched; the producers are untouched.

A correct, reproduced FAIL is a successful validation: the items that own the failed criteria move along their own ladders, and the validators run again, fresh and at their unchanged level, after the repair.

The script re-runs commands in the workspace, right after the batch's snapshot is captured and before anything else is dispatched, and logs every command it runs in `TASK/commands.log`. Files those re-runs write are recorded as the script's own check writes and become part of the state that is validated; checks should still write only to the evidence directory or to ignored paths.

Snapshots and the script see only the workspace. External systems and ignored files are outside them; validators list such side effects, and the report names them as not covered.
