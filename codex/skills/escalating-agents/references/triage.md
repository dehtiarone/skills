# Triage: what a result means

The script applies this table when you record a result. You supply only the worker's own `outcome`, `class` and `signature`; you never diagnose. A signature is the worker's 3-8 word name for the cause; the script derives one itself when a re-run check fails.

| Result | What the script does | Log line |
| ------ | -------------------- | -------- |
| Any failed, blocked, unusable or stalled take at level 1 | Next level, same model | `effort` |
| Failure at level 2, whatever its class (omission and scope included) | Next level, same model | `effort` |
| `PARTIAL` at a level, first time (first two times on Codex) | One continuation of the same worker at the same level | `retry` |
| The same signature twice at one level | Next level instead of another retry | `effort` |
| `class: environment` or `throttle` | Same level again after you remedy it, twice at most, then blocked; throttling also halves the batch width. Never raises effort or model | `retry`, `blocked` |
| `class: ambiguity` | Blocked until you ask the user and run `answer` | `blocked` |
| Failure at level 3, not yet narrowed | Waits for a narrowed scope | `next: narrow` |
| Failure at level 3 after narrowing, same signature at every level | Stops the item: it is stuck, not under-powered | `stopped` |
| Failure at level 3 after narrowing, otherwise | Waits at the gate (produce items); stops (map and verify items) | `next: gate` |
| Any return at level 4 that is not an accepted pass, whatever its class | Stops the item unresolved: exactly one take, no continuation, retry or re-opening at that price, and no third model | `stopped` |
| Take limit reached, or the budget does not admit the next take | Stops the item unresolved | `stopped` |
| Validator record rejected | That validator moves up one level; a fresh validator runs; producers untouched | `failed`, `effort` |
| Validator FAIL that reproduces | The owning items move along their ladders; all validators run fresh after the repair, at their unchanged level. Validators are not sent again while the workspace is unchanged | `failed` |
| Validator FAIL on a criterion no item owns (a review finding) | Blocks verification until you plan a produce item for the fix with that criterion, or end the run with it unresolved | `blocked` |
| A validator's required check was `NOT_RUN` | Not a pass: that validator retries at the same level after you fix the environment, twice at most, then blocks. Nothing is accepted meanwhile | `failed`, `retry`, `blocked` |
| One validator passed, another has not yet (free slots, a retry) | Nothing is accepted: the missing validator is dispatched alone on the same frozen state; the one that passed is not paid again | `note:` |
| A validator is stopped (ladder or take limit) | Verification cannot complete: the produced work is reported as not verified | `failed` |
| Files changed in the workspace outside any dispatch | Nothing is dispatched until you record who changed them (`drift`, below) | `failed` |

## Narrowing (`next: narrow`)

Decomposing a failed item is tried once before any model change. Run `LEDGER dispatch TASK <stage/slug> --narrow "<text>"`, where the text restates only the failing criterion as the smallest next step with every decision already made. Take it from the `next:` line of the worker's last reply or from the failed check; if you cannot state it, plan a `map` item that reads the item's records and proposes it. If the item cannot be made smaller, say why: `LEDGER gate TASK <stage/slug> --narrowing-impossible "<why>"`.

## The model gate (`next: gate`)

Run `LEDGER gate TASK produce/<slug>`. It writes `TASK/evidence/<slug>/escalation.md` and moves the item to the expensive model only when all six hold:

1. The cheap model's top effort was tried and the minimum number of cheap takes was used (4 on Claude Code, 5 on Codex).
2. Every retry carried its own correction citing the prior record, and none merely repeated the previous instruction.
3. The failure is classified `capability` by a separate, finished map item that ran after the failing take, or by a validator; the failing worker's own word or file does not count. Omission, environment, a flaky or vacuous check, ambiguity and scope conflicts never escalate the model.
4. The failure is confirmed independently: a check of this item that the script re-ran and saw fail (non-zero exit, or a plan check or expected text that did not hold), or a validator FAIL with reproduced evidence. A worker's claim, a check that could not start, and a failing command that is not one of the item's checks are not enough.
5. Narrowing was tried once and failed, or is recorded as impossible.
6. The budget still admits the expensive call and the validation after it.

It prints all six conditions, and for each one that failed the command to run next. For conditions 3 and 4, plan and dispatch the `map` item it prints (named `why-<slug>`); that worker's report ends with `class: …`, `reproduced: yes|no` and `command: …`. Then run `LEDGER classify TASK produce/<slug> <class> --by map/why-<slug>`: the script reads the class from that item's report, not from you, and counts the failure as reproduced only if the command is a plan check or a recorded check of the failing item and fails when the script re-runs it. If the class is not `capability`, fix the cause (correct the brief, repair the environment, replace the check, ask the user, extend ownership) or stop the item.

The expensive take is a fresh worker with its own brief: it starts from the task, is not held to the narrowed scope, and reads the earlier records only to learn what failed. The item is entitled to that take once: however it ends, nothing dispatches a second one. One item's escalation changes no other item.

## Out-of-scope files (`scope`)

At every batch close the script compares the workspace with the batch's owned outputs. For a legitimate dependency run `LEDGER scope TASK extend "<glob>"`; otherwise `LEDGER scope TASK reject`. The check cannot tell which worker strayed, so a rejection fails every item of that batch with class `scope` and lets their next takes revert the stray files. Never revert anything yourself.

## Files changed outside any dispatch (`drift`)

Before every batch the script compares the workspace with what the last batch left. If something changed in between (the user edited a file, you committed, a late worker wrote), it dispatches nothing and prints the paths. It never reverts them and neither do you. If the change is expected, run `LEDGER drift TASK accept "<who changed it and why>"`: the change becomes part of the work, anything validated before is validated again on the new state, and the report names it. If you do not know where it came from, ask the user. A file written by a check the script re-ran blocks in the same way, and the record that wrote it is rejected: fix the check, or release the path with a plan line `scratch <glob>`.

Changing a criterion's text, type, `check:` or `expect:` in a later plan is new work: every item that owns it starts again at level 1 on the cheap model, and its earlier takes, diagnosis and escalation record stop counting.

## Stopping

`LEDGER stop TASK <stage/slug> "<reason>"` ends an item unresolved. The run continues for the others, and the report lists it. A run with clearly stuck items ends early by design; a large budget is not a reason to keep trying.
