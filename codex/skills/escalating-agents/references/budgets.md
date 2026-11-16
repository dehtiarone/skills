# Budgets, takes and admission

The numbers for this host are in SKILL.md and are printed by `LEDGER numbers <host>`. The script does all arithmetic; this file explains it.

## Units

Every dispatch, retry and continuation costs units: 1 for a cheap-model call, and the expensive-call weight for a level 4 call (8 on Claude Code, 4 on Codex). Status calls and waits cost nothing. A budget is a cap, not a target: most runs end far below it, and stuck items stop early.

## Admission

A batch is admitted item by item, in plan order. An item joins only while

`used + cost of this batch + first takes still owed to other items + validators still to run + reserve ≤ budget`

- The reserve is one repair plus its revalidation (`1 + validators`). It is held until the first validation FAIL and then spent on repairs.
- A level 4 call is an ordinary item with a higher cost, so model escalation limits itself. The gate checks the same formula before it opens, so a passed gate is never refused at dispatch.
- A first take that is not admitted stays planned: merge items, or stop one. A stopped item no longer reserves anything. A retry that is not admitted stops its item unresolved. When no planned item fits what is left, the script says so and offers stop, promote or report.
- Serialising changes concurrency, not cost: every planned item is counted from the start.

Width is the smallest of: eligible items (dependencies done, no shared `locks:` name, owned outputs that cannot match the same path), the host's free slots (`--slots`, or what a `defer` taught), a declared limit (`limit <n>` for a service's rate limit, `writers <n>` if the user wants fewer parallel writers), the throttle backoff, and what admission allows. The three width inputs are kept apart and the smallest wins, so reporting more host slots never lifts a rate limit. There is no built-in ceiling. Two owned globs are treated as overlapping unless their literal prefixes or suffixes prove they cannot match one path (`src/*.ts` and `src/foo.*` overlap; `out/*.csv` and `out/*.json` do not); an uncertain pair runs one after the other. Decomposing into more, smaller items raises the call count, and the budgets leave room for that; when admission refuses, width is traded back by merging.

## Takes per item

A produce item's take limit covers the whole climb: three cheap levels, one narrowing take, the single level 4 take, and room for continuations and environment retries (8 on Claude Code). The limit is enforced at dispatch for every item, validators included. Map and verify items get the three cheap levels plus one retry (4). On Codex both limits are 1.5 times larger, because its cheap worker needs continuations more often.

## Worked example: tier B on Claude Code, budget 24

Four produce items, one validator.

| Step | Units | Used |
| ---- | ----- | ---- |
| Batch 1: 4 items at level 1. Admission: 0 + 4 + 0 + 1 + 2 ≤ 24 | 4 | 4 |
| Two items fail the script's re-run; batch 2 retries both at level 2 | 2 | 6 |
| Batch 3: validator at level 1 returns an unsupported PASS | 1 | 7 |
| Batch 4: fresh validator at level 2 reports FAIL on one criterion | 1 | 8 |
| Batch 5: that item's repair at level 3 | 1 | 9 |
| Batch 6: fresh validator, level 2, PASS | 1 | 10 |

## Worked example: one item climbs the whole ladder (Claude Code)

Levels 1, 2 and 3 (3 units), the narrowing take (1), a `why-` map item to classify the failure (1), then the gate. The gate uses the same admission formula as `dispatch`: used 5 + the level 4 call 8 + what the run still owes. In tier A nothing is owed but the reserve of 1, so 14 of 14 admits it. In tier B, C and D the owed part is the validation still to run plus the reserve (3, 3 and 5 units), on top of the other items' work. A continuation or an environment retry before the gate costs one unit each and can make the difference in tier A; then the item ends unresolved instead of escalating.

On Codex the same climb needs a fifth cheap take and usually one continuation per cheap level (8 cheap units), the map item (1) and the level 4 call (4): 13 units before what is owed.
