# Triage: what a result means

The script applies this table when you record a result. You supply only the worker's own `outcome`, `class` and `signature`; you never diagnose. A signature is the worker's 3-8 word name for the cause; the script derives one itself when a re-run check fails.

| Result | What the script does | Log line |
| ------ | -------------------- | -------- |
| Any failed, blocked, unusable or stalled take at level 1 | Next level, same model | `effort` |
| Failure at level 2 | Next level, same model | `effort` |
| `class: omission` or `scope` at level 2 or 3, first time | One fresh take at the same level with the correction | `retry` |
| First `PARTIAL` at a level | One continuation of the same worker at the same level | `retry` |
| The same signature twice at one level | Next level instead of another retry | `effort` |
| `class: environment` or `throttle` | Same level again after you remedy it, twice at most, then blocked; throttling also halves the batch width. Never raises effort or model | `retry`, `blocked` |
| `class: ambiguity` | Blocked until you ask the user and run `answer` | `blocked` |
| Failure at level 3, not yet narrowed | Waits for a narrowed scope | `next: narrow` |
| Failure at level 3 after narrowing, same signature at every level | Stops the item: it is stuck, not under-powered | `stopped` |
| Failure at level 3 after narrowing, otherwise | Waits at the gate (produce items); stops (map and verify items) | `next: gate` |
| Failure at level 4 | Stops the item unresolved; there is no third model | `stopped` |
| Take limit reached, or the budget does not admit the next take | Stops the item unresolved | `stopped` |
| Validator record rejected | That validator moves up one level; a fresh validator runs; producers untouched | `failed`, `effort` |
| Validator FAIL that reproduces | The owning items move along their ladders; all validators run fresh after the repair, at their unchanged level | `failed` |

## Narrowing (`next: narrow`)

Decomposing a failed item is tried once before any model change. Run `LEDGER dispatch TASK <stage/slug> --narrow "<text>"`, where the text restates only the failing criterion as the smallest next step with every decision already made. Take it from the `next:` line of the worker's last reply or from the failed check; if you cannot state it, plan a `map` item that reads the item's records and proposes it. If the item cannot be made smaller, say why: `LEDGER gate TASK <stage/slug> --narrowing-impossible "<why>"`.

## The model gate (`next: gate`)

Run `LEDGER gate TASK produce/<slug>`. It writes `TASK/evidence/<slug>/escalation.md` and moves the item to the expensive model only when all six hold:

1. The cheap model's top effort was tried and the minimum number of cheap takes was used (4 on Claude Code, 5 on Codex).
2. Every retry carried a correction citing the prior record.
3. The failure is classified `capability`. Omission, environment, a flaky or vacuous check, ambiguity and scope conflicts never escalate the model.
4. The failure is confirmed independently: a failing check the script re-ran, or a validator FAIL with reproduced evidence. A worker's own claim is not enough.
5. Narrowing was tried once and failed, or is recorded as impossible.
6. The budget still admits the expensive call and the validation after it.

When it refuses, it prints which condition failed and what to do. For condition 3, plan a `map` item named `why-<slug>` asking why the item fails; its report ends with `class: …` and `reproduced: yes|no`. Then run `LEDGER classify TASK produce/<slug> <class> --evidence <its report file>`: the script reads the class from the file, not from you. If the class is not `capability`, fix the cause (correct the brief, repair the environment, replace the check, ask the user, extend ownership) or stop the item.

The expensive take is a fresh worker with the brief and the record paths, not a continuation of a cheap worker. One item's escalation changes no other item.

## Out-of-scope files (`scope`)

At every batch close the script compares the workspace with the batch's owned outputs. For a legitimate dependency run `LEDGER scope TASK extend "<glob>"`; otherwise `LEDGER scope TASK reject`, which fails the batch's items with class `scope` and lets their next take revert the stray files. Never revert anything yourself.

## Stopping

`LEDGER stop TASK <stage/slug> "<reason>"` ends an item unresolved. The run continues for the others, and the report lists it. A run with clearly stuck items ends early by design; a large budget is not a reason to keep trying.
