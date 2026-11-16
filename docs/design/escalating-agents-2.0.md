# Design note: escalating-agents 2.0

Status: implemented in 2.0.0. Evidence retrieved 2026-11-16. Decisions are recorded with their reasons; open risks are at the end.

## 1. Goals, in priority order

1. The cheapest execution that still meets the acceptance criteria.
2. The shortest wall-clock time: small items, as many parallel subagents as is safe.
3. The shortest coordinator context: the coordinator delegates reading and writing and keeps state on disk.
4. Any coordinator model, from Opus or GPT-6.1 Sol down to Haiku or GPT-6 Luna.

One skill replaces `escalating-subagents` and `cheap-parallel-agents`, with one variant per host and one methodology. It is general-purpose: code changes, cloud-infrastructure research and audits, and data aggregation and processing.

## 2. Methodology in one page

Stages are **Map** (read-only scoping, exploration, diagnosis), **Produce** (implement, collect, transform) and **Verify** (fresh, independent checking). Work happens in a **workspace** (a repository or a plain directory) on **owned outputs**.

The coordinator plans criteria and small items, then loops: `dispatch` → start the printed workers → `result` for each reply → follow the `next:` line. A script, `scripts/ledger.sh`, owns every mechanical decision: admission arithmetic, which model and effort a worker gets, what a failure means, whether the model gate opens, whether a record is supported, the progress log, the status for resuming, and the final report. A weak coordinator therefore copies values and follows printed commands; it does not classify, estimate or compute.

Three properties carry the design:

- **Results, not predictions, move an item.** Every first attempt, in every tier and stage, is the cheap model at `low`. The script prints the model and effort; the coordinator has no input into them.
- **A worker's word is never the evidence.** Each record names, per criterion, a command and one line of its output. The script re-runs the command in the workspace right after the batch's snapshot is taken, before anything else is dispatched, and compares exit status and output. A check or expected text the coordinator fixed in the plan outranks the worker's choice, and tier A, which has no validator, requires one. Saved command output, cited sources and inspections are checked for the quoted line. A missing or unsupported record is an ordinary failure.
- **State is on disk.** Tier, criteria, decisions, items with ownership, levels, takes, budget, snapshots and record paths live under `TASK/`. `ledger.sh status` restores the picture after a compaction.

## 3. Ladder and model IDs

| Level | Claude Code | Codex | Notes |
| ----- | ----------- | ----- | ----- |
| 1 | `haiku` / `low` | `gpt-6-luna` / `low` | every first attempt |
| 2 | `haiku` / `medium` | `gpt-6-luna` / `medium` | automatic after any failure at level 1 |
| 3 | `haiku` / `high` | `gpt-6-luna` / `high` | one confirmed shortfall at level 2 |
| 4 | `sonnet` / `high` | `gpt-6.1-terra` / `high` | produce items only, through the gate, one take |

Effort is `low`, `medium` or `high` only. Validators and map items stop at level 3; no gate for moving a validator to the expensive model is defined, because a rejected validator record is cheap to redo and the script, not a stronger validator, establishes the facts.

IDs and accepted efforts were confirmed as API facts: the `haiku` and `sonnet` aliases and the `model` and `effort` parameters of the Agent tool in the Claude Code documentation (sub-agents, model-config, effort; per-call `effort` from v2.1.292, `haiku` as Haiku 5.5 from v2.1.293); `gpt-6-luna` (efforts `low`–`max`, `minimal_client_version` 0.155.0) and `gpt-6.1-terra` (efforts `low`–`ultra`, `minimal_client_version` 0.153.0, and a catalogue default multi-agent effort of `xhigh`, which is why the level 4 spawn always carries `reasoning_effort: high` explicitly) in the model catalogue of the installed Codex client 0.169.0, together with `spawn_agent`, `fork_turns` (`all` or `none`), `wait_agent`, `followup_task`, and the `[agents]` keys `default_subagent_model` and `default_subagent_reasoning_effort`. The OpenAI web documentation could not be fetched in this session; the installed client was the source.

### 3.1 The expensive segment: option (b), one rung at `high`

The brief asked for a choice between (a) a full `low → medium → high` expensive segment, (b) a shortened one, (c) escalation only for some task kinds, (d) opt-in or none, from independent evidence only. Sources and affiliation checks are in `docs/evidence/independent-sources-2026-11-16.md`.

Evidence for (b):

- **Claude pair, coding.** On FrontierCode 2.0, Haiku `high` (.1927, $0.139) scores above Sonnet `low` (.0966, $0.369) and `medium` (.1496, $0.482); only Sonnet `high` (.2295, $1.066) is above it. Artificial Analysis' re-run of the same tasks agrees (.232 vs .071, .110, .257), and its index puts Sonnet `low` and `medium` (25.6, 30.8) at or below Haiku `high` (29.9), with `high` (41.5) clearly above.
- **Codex pair.** Terra is absent from FrontierCode. On Artificial Analysis, Terra `low` (29.4) already beats Luna `high` (21.4), and Terra `high` reaches 42.4 at $0.259 per index task, 3.5 times Luna `high`.
- **Cascade research.** Escalation pays when an executed check decides it; repair attempts lose most of their value within two or three tries; the strong model should start fresh from the task, not continue the weak trajectory; errors are correlated across models, so expect partial rescue. The one study of effort ladders (simulated, Together AI) jumps from lowest to highest.

So after an item has used at least four cheap takes and passed the gate, the take with the highest independent expected gain is the expensive model at `high`, on both hosts. Restarting at `low` (option (a)) would on Claude spend two calls that are dearer and no stronger than the take that just failed.

Against the alternatives. (a): contradicted by the Claude rows. (c): the task-kind signal conflicts between sources (Sonnet's edge is large on tool use and terminal work, small on research and data; Terra's research signal differs between LiveBench and Vals), and a kind-dependent rule would add a judgment the coordinator must make. (d): Sonnet `high` and Terra `high` show real gains over the cheap model's `high` in every independent source that has the rows, so removing escalation would leave provably solvable items unresolved; the gate and the cost weight already make it rare.

Caveats. For the Codex pair the evidence points to (a) being viable too: Terra `low` would often suffice at a quarter of the cost. One shared option was required; (b) costs Codex at most one dearer call per escalated item and saves two possible extra takes. Terra has no Codex-harness row at these efforts, so its rung is an **initial recommendation to evaluate**. All of this is coding and agent evidence; for research and data work it is a proxy, and on data analysis (Hex) the expensive model's edge is small.

### 3.2 The cheap segment and the cost of starting at `low`

`low → medium → high` on both hosts. Haiku gains at each step on every benchmark that has the rows. Luna gains almost everything at `medium` (FrontierCode +12.07 points, then +0.38); `high` is kept because a level may be skipped only on both hosts and Haiku's `high` step is its largest.

Starting everything at `low` is a requirement. Its cost, stated plainly:

- A `low` start is cheaper than a `medium` start when the share of `medium`-solvable items that `low` also solves exceeds the cost ratio of the two calls. For Haiku the share is about 0.75 on FrontierCode against a cost ratio of 0.67: a small saving. For Luna the share is 0.25 against a cost ratio of 0.25: break-even, and slower by one short failed call for three items in four.
- Independent research says cascading wastes money where the cheap setting is very weak (Chen et al.), and Luna `low` is very weak on hard tasks (FrontierCode .0405, Terminal-Bench 4.0 .000 at Artificial Analysis).
- The skill's items are far smaller than benchmark tasks, where `low` should succeed much more often; no independent source measures that.

So on Codex the `low` start is expected to be roughly cost-neutral and somewhat slower for hard items, and cheaper for easy ones. Three things keep it safe rather than merely cheap: the script-run evidence check (a `low` worker cannot wave work through), the automatic step to `medium` with no diagnosis, and larger Codex budgets. No role was found for which `low` is unsafe, so no exception is proposed. If measured runs show Luna `low` failing most first takes, the smallest change would be a Codex-only start at `medium`; it is not adopted because it would break "one ladder shape on both hosts".

### 3.3 Coordinator

The skill states that it works under any parent model and gives no recommendation. A level 4 worker may be stronger than a Haiku or Luna coordinator; nothing depends on the coordinator out-reasoning a worker, because acceptance is the script's verdict.

## 4. The model gate

`ledger.sh gate` writes `TASK/evidence/<item>/escalation.md`, prints the six conditions, and moves the item to level 4 only if all hold: (1) the cheap model's top effort was tried and the minimum cheap takes were used, 4 on Claude Code and 5 on Codex; (2) every retry carried its own correction citing the prior record, and none merely repeated the previous instruction; (3) the failure is classified `capability` by a diagnosis file or a validator, never by the failing worker; (4) it is confirmed independently by a check the script itself re-ran and saw fail, or by a reproduced validator FAIL; (5) narrowing was tried once and failed, or is recorded as impossible; (6) the same admission formula `dispatch` uses admits the expensive call, so a passed gate is never refused at dispatch.

Conditions 1, 2, 4, 5 and 6 are computed from the ledger. Condition 3 needs a judgment, which is delegated: a cheap read-only `map` item diagnoses the failure and writes `class: …`, `reproduced: …` and `command: …` in its report; `ledger.sh classify` reads the class from that file and re-runs the command before it counts the failure as reproduced. Neither the coordinator nor the failing worker can assert it. A record that was merely missing or malformed confirms nothing.

The level 4 take is one take: any failure there stops the item, with no continuation or retry at that price (an environment failure or an ambiguity blocks it instead). Its brief is a separate template that starts from the task rather than from the narrowed scope. Narrowing before the gate follows ADaPT's finding that decomposing after a failure beats retrying.

The Codex minimum is 5 because Luna's `high` adds little over `medium`, so one failed `high` take says less; a second corrected take is required before paying for Terra.

## 5. Budgets and takes

Unit of account: a cheap call is 1 unit; a level 4 call is 8 units on Claude Code (Sonnet `high` costs 7.7 times Haiku `high` on FrontierCode, 10.3 times at Artificial Analysis) and 4 on Codex (Terra `high` costs 3.5 times Luna `high` at Artificial Analysis). Cost-weighted units were adopted because the script, not the coordinator, does the arithmetic, and they make escalation self-limiting.

**Takes per item.** Produce, Claude: three cheap levels + one omission retry + one narrowing take + one level 4 take + one continuation + one environment retry = 8. Map and verify, Claude: three levels + one retry = 4. Codex: 12 and 6, factor 1.5, covering one extra continuation per cheap level: Luna's `low` rollouts are short (6.5k output tokens on FrontierCode against 31k at `medium`), so it returns PARTIAL more often.

**Run budgets, Claude Code.** Budget = planned calls + one step-up per item + reserve + one full climb. With M map items, n produce items, V validators, reserve `1 + V`, and a full climb costing 3 further cheap takes plus the 8-unit call:

| Tier | Assumed shape | Planned M + n + V | Step-ups n | Reserve | Full climb | Sum | Budget | Old cheap-skill budget |
| ---- | ------------- | ----------------- | ---------- | ------- | ---------- | --- | ------ | ---------------------- |
| A | n = 1, V = 0 | 1 | 1 | 1 | 11 | 14 | 14 | 3 |
| B | M = 1, n = 4, V = 1 | 6 | 4 | 2 | 11 | 23 | 24 | 7 |
| C | M = 3, n = 6, V = 1 | 10 | 6 | 2 | 11 | 29 | 30 | 10 |
| D | M = 3, n = 6, V = 2, one extra validation cycle | 11 | 6 | 3 | 11 + 2 | 33 | 36 | 12 |

Every budget is at least twice the old one (3.0 to 4.7 times).

**Codex factors.** Required range 1.5–2.0, chosen per tier:

| Tier | Claude | Codex | Factor | Reason |
| ---- | ------ | ----- | ------ | ------ |
| A | 14 | 21 | 1.50 | One item: the expected `medium` take and one continuation; the floor of the range |
| B | 24 | 36 | 1.50 | Few items; same reasoning |
| C | 30 | 50 | 1.67 | Each of more items is expected to need its `medium` take (about three in four on FrontierCode-like work, against one in four for Haiku), and map items start at `low` too |
| D | 36 | 64 | 1.78 | As C, plus two validators that each start at `low` and re-run after every repair |

Evidence for the factor is indirect: Luna's first-take failure rate at `low`, its short rollouts, and its lower per-call cost (Luna `low` $0.023, `medium` $0.092 against Haiku $0.065, $0.097), which keeps the dollar cap of a Codex run at or below a Claude run despite more calls. The exact values inside the range are initial recommendations to evaluate.

**Admission.** `used + this batch + first takes owed to other items + validators still to run + reserve ≤ budget`, item by item. The reserve (`1 + V`) is held until the first validation FAIL and then spent. A level 4 call is an ordinary, dearer item, so the old "after a FAIL on r items" cases fall out of the same formula: retries that do not fit stop their item unresolved, and validation is never run on an unchanged patch.

**No-progress detection**, applied by the script: the same signature twice at one level moves the item up instead of retrying; the same signature at all three cheap levels and again after narrowing stops the item as stuck rather than sending it to the gate; environment retries are capped at two; take limits and the budget stop the rest. A stuck run ends after a handful of units, whatever the budget. Signatures for script-detected failures include a checksum of the check's output, so different wrong results do not look like the same failure. Validators are not dispatched again while the workspace is unchanged since their last FAIL; a failed criterion no item owns (a review finding) blocks verification until a fix is planned; a stopped validator ends verification with the work reported as unverified; and take limits are enforced at dispatch for every item.

## 6. Parallelism

Width = min(eligible items, host slots, writer ceiling, admission). Eligibility: disjoint owned outputs (the script tests the globs), satisfied `after:` dependencies, no shared side effects (the coordinator encodes these as `after:` from map reports). Validators never share a batch with writers, and nothing is dispatched while a validator is out.

The fixed caps of 4 writers and 3 read-only shards are gone. Read-only map items have no ceiling: no independent study supports one. For writers a ceiling stays, at 6 and configurable (`writers <n>`): CAID improved from 2 to 4 parallel engineers and fell at 8, and agent pull requests conflict often when co-active. Those studies had agents share files; here ownership is disjoint and checked, which removes the merge-conflict mechanism but not integration errors, so the ceiling is set between the two measured points and labelled an initial recommendation to evaluate.

Width against the retry reserve: a finer split means more first takes, all counted by admission from the start; when the budget cannot carry them plus validation plus the reserve, the script refuses and the coordinator merges. The budgets above assume the finer split.

Pipelining: map and produce items that do not depend on each other go out in one batch. Preparing the next batch's briefs while a batch runs was rejected: briefs carry the batch snapshot name and the decisions list, both fixed only when the batch opens, and brief writing is now a script call that takes under a second.

Snapshots: `pre-N` before each batch, `post-N` and the scope check after it, the integrated patch written by the same call, `final` at the report with a check that nothing changed after validation.

## 7. Evidence, kinds and tiers

Evidence types: `behavioral`, `static`, `parse`, `format`, `schema`, `reconciliation`, `recompute` (re-run by the script); `command-output`, `source` (saved file checked for the quoted line; commands scanned for changing verbs); `inspection` (cited file checked). A record must use its criterion's own type, which makes "weaker evidence never satisfies a stronger criterion" a string comparison.

Tiers are chosen by consequence: D for production or shared systems, irreversible or costly changes, credentials, secrets or personal data, and numbers or recommendations someone will act on financially. Tier D adds a second validator that reviews the integrated patch, and never a stronger start.

Outside the workspace everything is read-only unless the user authorised the exact action (`allow` line). Workers log external commands; the script scans logs and records for changing verbs and scans the run files for secret values from the environment, reporting file names only.

Snapshots outside git: `agent-snapshot.sh init --plain` keeps a private repository in the task directory over a plain directory, so "named snapshots are immutable" and the scope check hold for data and research outputs. External systems cannot be snapshotted; the report says so.

## 8. Coordinator context

What the coordinator no longer reads or writes:

- The snapshot helper: a file under `scripts/`, run by path. `git log` shows no recorded reason for embedding it in 1.0.0 beyond single-file installation ("No companion file is needed"); both hosts document bundled `scripts/` as the place for deterministic code, and Claude Code exposes the skill directory as `${CLAUDE_SKILL_DIR}`. The SHA-256 pin existed to catch a bad `sed` extraction and is dropped with the extraction; a test keeps the scripts byte-identical across hosts.
- Briefs: templates live in `references/briefs/`; the script assembles each brief file (template, kind rules, run block, item block, in that order, so the shared part comes first) and the coordinator's prompt is two lines, the first identical for every worker.
- Arithmetic, triage, gate checks, scope checks, the ledger and the report: script output of a few lines each.
- Source files, logs, patches, data: delegated to map items and validators. The one former exception, the coordinator reading the tier D patch, is replaced by the `verify/review` validator; a disagreement between validators is settled by a map item. No exception remains.

Worker replies are capped at 10 lines. Reports carry a `## Plan lines` section so the coordinator can plan produce items from a map report without reading the rest.

Loading plan: SKILL.md always. Tier A or B code task: nothing else. `kind-infra.md` or `kind-data.md` for those kinds; `kind-code.md` and `tiers.md` for tier C or D; `triage.md` the first time a `next:` line says narrow, gate, blocked or scope; `budgets.md`, `pinning.md`, `evidence.md`, `report.md` only in their situations.

| Measure | 1.2.0 | 2.0.0 |
| ------- | ----- | ----- |
| Largest SKILL.md | 33,928 B (about 8,500 tokens), 337 lines | 12,155 B Codex, 11,822 B Claude (about 3,000 tokens), 108 and 111 lines |
| Loaded for a tier B code run | 33,468 B | 11,822 B |
| Loaded for a tier D code run, no failures | 33,468 B | 15,538 B (SKILL.md, `tiers.md`, `kind-code.md`) |
| Loaded for a tier D run with a gate | 33,468 B | 21,083 B (adds `triage.md`) |
| Coordinator text per brief | 15 required fields; about 1,500–2,500 B (estimate, no trace kept) | two lines, 316 B in the live run, plus one plan line per item |

Byte counts are measured; token counts assume four bytes per token. Claude Code re-attaches an invoked skill after compaction up to 5,000 tokens, so the whole SKILL.md survives.

## 9. Progress log

The format follows the brief's proposal with these decisions:

- `units` replaces `calls` in budget fields, because calls are cost-weighted.
- A batch of two or more prints one `batch` line and no per-worker `started` lines, on both hosts: both hosts show running subagents in their own interface, and each relayed line costs coordinator output. A single dispatch prints its `started` line. Every `started` line is still written to `TASK/log.txt`.
- A produce item's `done` line is printed at batch close, after the script has re-run its checks, so a line never says `done` for work that then fails.
- A `model` line carries the failure that led to it, then `gate 6/6` and the record's file name.
- Symbols default to Unicode in a UTF-8 locale and to the ASCII set otherwise, detected by the script on both hosts; `--ascii` forces it.

## 10. Host differences

Enumerated in `test/escalating-agents.test.mjs`. In SKILL.md: frontmatter (`disable-model-invocation`, `argument-hint`, `allowed-tools` on Claude; `agents/openai.yaml` on Codex), `compatibility`, the title, how the script path is found, `--host`, the ladder rows, the numbers rows, the level 4 weight, and the Dispatch paragraph. In `references/`: `pinning.md`. Everything else is byte-identical.

Checked against current host behaviour:

- Claude Code: `general-purpose` for every worker; `Explore` denies Write, so it cannot write its report file; a fork inherits the parent; subagents run in the background by default and validators are run in the foreground; the concurrency error text starts "Concurrent subagent limit reached"; per-call `model` outranks a subagent definition's `model`, which outranks `CLAUDE_CODE_SUBAGENT_MODEL`; `CLAUDE_CODE_EFFORT_LEVEL` outranks per-call effort.
- Pinned subagent definitions (`agents/*.md` with `model: haiku`) are not shipped: the per-call parameter already wins, a definition fixes one effort so six files would be needed, and users who copy `skills/` alone would not get them. `pinning.md` mentions them as an option.
- Codex: `fork_turns: "none"` always; the advertised slot count is passed as `--slots`; role files and `[agents]` defaults are shown as a fallback in `pinning.md`, not shipped. The script prints `reasoning_effort=` on Codex and `effort=` on Claude Code, and marks validators with `barrier=yes` instead of a host-specific background flag.
- Pinning verdicts are derived, not asserted: Known mismatch from the environment preflight, from `ledger.sh pinning TASK mismatch`, or from any `--ran` that differs; Verified only when every call's `--ran` equals the request.

Vendor guidance followed (how to write a skill, not performance evidence): Anthropic, "Skill authoring best practices" (<https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>) and Claude Code "Skills" (<https://code.claude.com/docs/en/skills>): body under 500 lines, third-person description of what and when, references one level deep from SKILL.md, scripts executed rather than read, no time-sensitive content, one term per concept, checklists and feedback loops. The Agent Skills specification (<https://agentskills.io/specification>): `name` matches the directory, description up to 1,024 characters, `scripts/`, `references/`, instructions under 5,000 tokens. OpenAI's `skill-creator` guidance shipped with the Codex client: include only what changes decisions, keep discovery cheap, disclose detail progressively, use `scripts/` where deterministic execution improves reliability, keep `agents/openai.yaml` consistent with the skill, `short_description` of 25–64 characters, `default_prompt` naming `$skill`.

One conflict: OpenAI's guidance says to avoid tests that "merely match generated wording". This repository's tests do check wording in places, to keep two host variants identical; behaviour is tested separately through the scripts.

## 11. Rejected alternatives

- Keeping the coordinator's own patch reading in tier D: replaced by a fresh reviewer, as above.
- A worker-side wrapper that records checks: re-running the recorded command in the coordinator's script gives stronger evidence with nothing for the worker to learn.
- Hash-pinning the scripts: see section 8.
- Alias stubs for the old skill names: neither host offers an alias at zero context cost; the changelog carries the migration.
- Per-kind or per-tier starting levels, and any "this looks hard" shortcut: excluded by requirement and by the routing evidence (up-front routing did not work on SWE-Bench).
- A third model, or effort above `high`: excluded by requirement.
- Rendering the report in the coordinator: the script renders it; the coordinator relays about 25 lines.

## 12. Open risks

1. **The ledger script is large** (about 1,400 lines of Bash 3.2). It is covered by scenario tests, but a bug in it is a bug in every run. Its verdict lines are the interface; the coordinator has no fallback if it fails, other than reporting the failure.
2. **Re-running recorded commands** executes strings written by a cheap worker, in the coordinator's sandbox. That is the same trust a validator already had, but it now happens in the parent's process. The changing-verb scan is a heuristic, not a sandbox: it can miss a changing command and can flag a read-only one. A check that writes non-ignored files shows up as a change after validation.
3. **The `low` start on Codex** may cost time without saving money on hard items (section 3.2).
4. **Terra's rung, the Codex factors and the writer ceiling** rest on indirect evidence and are labelled initial recommendations to evaluate.
5. **Decisive-line checking can be gamed** by a check that prints a fixed line without exercising the criterion. Validators are told to reject vacuous checks and tier D adds a reviewer, but the script cannot detect a well-formed vacuous check.
6. **Weak coordinators** have been designed for but not observed: see section 13.
7. **A scope rejection fails every item of its batch**, because the scope check cannot tell which worker strayed.

## 13. Verification status at release

- `node --test`: passes (Node 24, Bash 3.2, Git 2.54, macOS). Node 22 and the Linux and oldest-Git jobs run in CI only.
- `claude plugin validate ./claude`: passes, with the existing missing-icon warning.
- `claude plugin eval`: **not run**. The only `claude` CLI on the authoring machine was not logged in, and an unauthenticated eval scores zero. No eval trace exists, so coordinator turns, peak context and compactions under `sonnet` and `haiku` coordinators are **not measured**.
- One live run outside the eval harness: the tier B fixture with real `haiku`/`low` workers under a Fable coordinator. Three produce items and one validator, four calls, every first take accepted after the script re-ran the checks, 4 of 24 units, eleven coordinator tool calls, worker replies of four to six lines. The `low` validator made a stray workspace edit and reverted it; the scope check confirmed no change. One run, one coordinator model: an existence proof, not a measurement.
- Codex: nothing was run. Identifiers come from the installed client's catalogue and tool descriptions.
- Two independent reviews (requirements, and drift between hosts) were run on the finished branch; their findings are fixed in this release, with regression tests in `test/ledger.test.mjs`.
