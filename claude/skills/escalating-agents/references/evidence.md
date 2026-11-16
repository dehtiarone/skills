# Evidence types and records

A criterion is one line: an ID (`C1`), one evidence type, what must be true, and optionally a named check. Write criteria before dispatching; producers and validators receive the same ones.

A record satisfies a criterion only with the criterion's own type. Weaker evidence never satisfies a stronger criterion: a `parse` check proves the file parses and nothing more, and reading a diff never stands in for running the code.

| Type | Proves | How the script verifies the record | Typical use |
| ---- | ------ | ---------------------------------- | ----------- |
| `behavioral` | Executed test, build or run exercises the result | Re-runs the command; exit status and the quoted output line must match | Code; a pipeline run |
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

A record is rejected, and its worker's take counts as an ordinary failure, when any block has: a type other than the criterion's; a command that does not reproduce the recorded exit status; no output, or output without the quoted decisive line; a FAIL whose command passes; `NOT_RUN` without `class: environment` and a reason; a missing block for one of the item's criteria; a check or expected text fixed in the plan that does not hold. In tier A, which has no validator, every criterion must carry such a `check:` in the plan. A missing report or record file is the same failure. A rejected validator moves up one level and a fresh validator is dispatched; the producers are untouched.

A correct, reproduced FAIL is a successful validation: the items that own the failed criteria move along their own ladders, and the validators run again, fresh and at their unchanged level, after the repair.

The script re-runs commands in the workspace, right after the batch's snapshot is captured and before anything else is dispatched. A check that itself writes non-ignored files therefore shows up in the report as a change after validation: checks should write only to the evidence directory or to ignored paths.

Snapshots and the script see only the workspace. External systems and ignored files are outside them; validators list such side effects, and the report names them as not covered.
