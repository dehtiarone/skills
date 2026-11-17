---
name: escalating-agents
description: Explicit-only orchestration that splits a code change, a cloud-infrastructure research or audit task, or a data aggregation task into small items for parallel cheap subagents, and raises effort, then model, only on recorded evidence. Invoke it by name; it is never applied automatically.
license: MIT
disable-model-invocation: true
argument-hint: "<task>"
allowed-tools: "Bash(${CLAUDE_SKILL_DIR}/scripts/ledger.sh *) Bash(bash ${CLAUDE_SKILL_DIR}/scripts/ledger.sh *)"
compatibility: Requires Bash 3.2+ and Git 2.31+ on macOS or Linux (Windows only via WSL), and a Claude Code whose Agent tool accepts `model` and `effort` and whose `haiku` alias is Haiku 5.5 (v2.1.293+).
metadata:
  version: "2.0.0"
  author: dehtiarone
  repository: https://github.com/dehtiarone/skills
---

# Escalating agents for Claude Code

This skill runs only when the user invokes it by name. You are the coordinator: you plan, dispatch and relay; cheap subagents read, produce and verify. It works under any parent model, weak or strong, because every decision below is a table lookup or a script verdict. It never changes your model or effort.

`LEDGER` below means `${CLAUDE_SKILL_DIR}/scripts/ledger.sh` (prefix it with `bash` if it is not executable). Run it; never read the scripts. `TASK` is the directory `init` prints.

## Rules that always hold

1. **Every first attempt is the cheap model at `low` effort**, in every tier and stage, validators included. The script prints the model and effort of each dispatch; use exactly those. Never choose a model or effort, and never estimate how hard an item is: results move an item up, predictions do not.
2. **Subagent effort is `low`, `medium` or `high`**, never above or below.
3. **The expensive model is used only after `LEDGER gate` prints a `model` line for that item.** Never for a first attempt, never for a validator or map item, never because an item looks hard.
4. **You delegate only through the script's dispatches, reading as well as writing.** Do not open source files, data, logs, worker transcripts, full patches or brief templates. Read only script output, worker replies (10 lines at most) and the report section a `next:` line points you to. To learn something about the workspace, plan a `map` item.
5. **Workers never** commit, push, deploy, delegate, or run the scripts. Outside the workspace everything is read-only unless the user authorised that exact action (`allow` plan line). Credentials, tokens and secrets never appear in a brief, a reply, evidence or the report.
6. Never reset, stash, clean or revert work you did not dispatch. In Plan mode dispatch nothing that writes.
7. **State lives in `TASK`, not in your memory.** After a compaction, an interruption or any doubt, run `LEDGER status TASK` and continue from its `next:` line; if workers were out and you no longer hold them, run `LEDGER reconcile TASK`; it closes a take only for a worker you name `--stopped` once the host shows it ended.

## Run loop

1. **Start.** Pick the tier and kind from the tables below, then:
   `LEDGER init --host claude --tier <A|B|C|D> --kind <code|infra|data> --workspace "<absolute path>" --coordinator <your model>/<your effort>`
   The workspace is the repository, or the plain directory that will hold the outputs (snapshots work without git). For kind `infra` or `data` read `references/kind-infra.md` or `references/kind-data.md` now; for `code` in tier C or D read `references/kind-code.md`.
2. **Plan.** One `plan` call, repeated whenever items are added:
   ```text
   LEDGER plan TASK <<'EOF'
   request <the user's request, verbatim; one `request` line per line of it>
   criterion C1 behavioral | <what must be true when done> | check: <command, if the request names one> | expect: <text its output must contain>
   decision <a name, interface or convention every worker must share>
   allow <an external change the user explicitly authorised>
   item map <slug> | <one question to answer>
   item produce <slug> | <one behaviour to produce> | owns: <globs> | criteria: C1 | after: <slug> | locks: <name>
   EOF
   ```
   - In tier C or D, or whenever you would have to read files to plan, plan only `map` items first. Their replies and the `## Plan lines` section of their reports give you the produce items.
   - **Sizing rule:** one behaviour per item; one criterion per item, two at most; owned outputs disjoint from every other item; small enough for one sitting (about five files, one data source, or one account and region). Prefer more, smaller items; merge only when `dispatch` says an item is not admitted.
   - Give a criterion its `check:` whenever the request or a map report names a command. Without one it passes only on a check a worker chose or evidence a worker saved, and the report says `PROVISIONAL`, not `complete`. Never write a secret's value into a plan line; name its variable.
   - Items that share a database, port, cache or generated file get the same `locks: <name>`; they then never run side by side.
   - A slug is 20 characters at most and names the purpose (`fix-parser`, not `item-3`). Validators are added for you.
3. **Loop until a `next:` line says `report`:**
   1. `LEDGER dispatch TASK`. It admits the widest safe batch, snapshots the workspace, writes the briefs and prints one `dispatch` block per worker.
   2. Start every printed worker in one message, as "Dispatch" below says, and record each id the host returns: `LEDGER bind TASK <stage/slug> <id>`.
   3. For each reply: `LEDGER result TASK <stage/slug> <outcome> [--class <class>] [--sig "<signature>"] [--worker <its id>]`, copying `outcome`, `class` and `signature` from the reply. A missing or malformed reply is `UNUSABLE`. The script re-runs the recorded checks itself; a worker's word is never the evidence.
   4. Do what each `next:` line says, with the command it prints: `dispatch`; `narrow` (restate the one failing criterion with decisions pre-made); `gate`; a blocked item (ask the user, then `answer`); out-of-scope files (`scope`); files changed outside any dispatch (`drift`); a pinning mismatch (ask the user). If a line needs a fact you do not have, plan a `map` item to get it. `references/triage.md` explains each case; read it the first time one appears.
4. **Report.** `LEDGER report TASK [--external "<external actions actually taken>"] [--usage "<measured tokens or cost>"]`, then relay what it prints as your final message.

## Tiers: choose by consequence, first matching row from the top

| Tier | Choose when                                                                                                                                                                     | Stages                 | Verification                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| D    | It touches production or shared systems, is irreversible or costly, handles credentials, secrets or personal data, or yields numbers or recommendations someone will act on financially | Map → Produce → Verify | 2 validators: executed checks and an independent review  |
| A    | Exactly one trivial, fully specified, reversible item whose check the request names (every criterion needs `check:`)                                                           | Produce                | none: the script runs the named check on the frozen state |
| B    | A clear task you can plan from the request alone, without reading anything                                                                                                     | Produce → Verify       | 1 validator                                              |
| C    | Anything else: unknown scope or cause, a substantial task, or one you cannot plan without reading                                                                              | Map → Produce → Verify | 1 validator                                              |

A tier is promoted, never demoted, when a stage reveals more: `LEDGER promote TASK <tier> "<why>"`. Tier D gets more scrutiny, never a stronger first attempt. Examples for each kind and the tier D procedure: `references/tiers.md`.

## Ladder and numbers

| Level | Model    | `effort` | Reached by                                                                            |
| ----- | -------- | -------- | ------------------------------------------------------------------------------------- |
| 1     | `haiku`  | `low`    | Every first attempt                                                                   |
| 2     | `haiku`  | `medium` | Any failed, blocked, unusable or stalled take at level 1; no diagnosis needed         |
| 3     | `haiku`  | `high`   | One confirmed shortfall at level 2                                                    |
| 4     | `sonnet` | `high`   | Produce items only, and only through the gate; one take, then the item stops unresolved |

Validators and map items stop at level 3. Environment, throttling, omission and ambiguity never raise the model; `references/triage.md` has the full table.

| Tier | Budget (units) | Takes per produce item | Takes per map or verify item |
| ---- | -------------- | ---------------------- | ---------------------------- |
| A    | 14             | 8                      | 4                            |
| B    | 24             | 8                      | 4                            |
| C    | 30             | 8                      | 4                            |
| D    | 36             | 8                      | 4                            |

A cheap call costs 1 unit and a level 4 call 8. The budget is a cap, not a target; the script does the arithmetic and keeps a reserve for one repair and its revalidation (`references/budgets.md`). Batch width is the smallest of: eligible items, the host's free slots, a `limit` or `writers` line in the plan, and what the budget admits. There is no other ceiling.

## Dispatch (Claude Code)

For each `dispatch` block make one `Agent` call with `subagent_type: "general-purpose"`, `model` and `effort` exactly as printed, and the two indented lines as the whole `prompt`. Put the batch's calls in one message. Never use `subagent_type: "fork"` (it inherits your model and context) or `Explore` (it cannot write its report file). Wait for every worker of the batch before recording results; where the host runs agents in the background, that means waiting for each completion notice. Blocks that say `barrier=yes` are validators: until each of them has returned, dispatch, plan and report nothing. A tier's validators may run together or one after another; the script accepts only when all of them passed the same frozen state. `continue=same-worker` means: send the two lines to that worker with `SendMessage` instead of a new call; if that worker is gone, start a new one. On `Concurrent subagent limit reached`, run `LEDGER defer TASK <the refused items>`. If the host shows the model or effort a worker really ran on, add `--ran <model>/<effort>` to its `result`. If `init` or a `next:` line reports a pinning mismatch, or a call hides or rejects `model` or `effort`, nothing more is dispatched: read `references/pinning.md`.

## Evidence

Each criterion has an ID and one evidence type; a record must use that same type, and weaker evidence never satisfies a stronger criterion. A PASS means the command exits 0 and is more than fixed text; a plan `check:` is judged only by its own run; a required check that was not run is never a pass. The script refuses commands it recognises as changing an external system and, in an infra run, every command the plan did not fix; an `allow` line covers only that exact command. A screen, not a sandbox. Re-run by the script: `behavioral`, `static`, `parse`, `format`, `schema`, `reconciliation`, `recompute`. Saved output or copy, provisional unless the plan fixes a `check:`: `command-output`, `source`. Cited location checked by the script: `inspection`. Choose the strongest type the work allows; `references/evidence.md` lists which fits which kind of task.

## Progress log

Relay to the user, verbatim and without additions, every script line that starts with `▶ ✓ ✗ ↑ ⇧ ⏸ ■` (or `>`, `ok`, `x`, `^`, `^^`, `||`, `#` in ASCII mode). Write no other progress text, no line for waits, and no reformatting. Lines starting `next:`, `note:` or `dispatch` are for you.

## References

Read a file only when its situation arises.

- `references/tiers.md`: the tier is unclear, or the tier is D.
- `references/kind-code.md`, `references/kind-infra.md`, `references/kind-data.md`: as step 1 says.
- `references/evidence.md`: writing criteria for an unfamiliar kind, or a record was rejected and you must correct a brief.
- `references/triage.md`: a `next:` line says narrow, gate, blocked, scope or drift.
- `references/budgets.md`: `dispatch` did not admit an item, or the user asks about cost.
- `references/pinning.md`: `init` or a dispatch reports a model or effort problem.
- `references/report.md`: the user asks what a report field means.
- `references/briefs/`: worker templates. The script puts them into each brief; do not read them.
