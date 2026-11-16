# Changelog

## 2.0.0 (unreleased)

Not yet verified by a scored eval run; see `docs/design/escalating-agents-2.0.md`, section 13.

Breaking: one skill, `escalating-agents`, replaces `escalating-subagents` and `cheap-parallel-agents`. The old skill names no longer exist and no aliases are shipped.

### Migration

| Before | Now |
| ------ | --- |
| `/escalating-subagents <request>` or `/cheap-parallel-agents <request>` (Claude Code) | `/escalating-agents <task>`; as a plugin, `/dehtiarone-skills:escalating-agents <task>` |
| `$escalating-subagents` or `$cheap-parallel-agents` (Codex) | `$escalating-agents` |
| `cp -r …/SKILL.md`-only installs | Copy the whole skill directory: it now needs `scripts/` and `references/` |
| Remove the old installs | Delete `~/.claude/skills/{escalating-subagents,cheap-parallel-agents}` and the same under `~/.agents/skills/` |

Behaviour differences to expect:

- **Every subagent starts on the cheap model at `low` effort**, in every tier and stage, tier D and validators included. `escalating-subagents` started tier D discovery and validation on Sonnet or Sol; `cheap-parallel-agents` started most work at `medium`. The coordinator no longer chooses a starting level or judges difficulty.
- **Models:** Haiku 5.5 then Sonnet 5.5 on Claude Code; GPT-6 Luna then GPT-6.1 Terra on Codex. Opus, Sol and every other model are gone from the ladders. Effort is `low`, `medium` or `high` only; the `max` rung is removed.
- **Effort escalation is automatic**; **model escalation is gated** per item by six recorded conditions and an `escalation.md` file, then gets exactly one take at `high`. `cheap-parallel-agents` never changed model; `escalating-subagents` changed it after one or two failures.
- **Acceptance is checked by a script.** Records name a command and a line of its output per criterion; the script re-runs the command, and a check fixed in the plan outranks the worker's own. Tier A requires a named check on every criterion. The coordinator no longer inspects acceptance records, reads the tier D patch, or reads the snapshot helper.
- **Stages are Map → Produce → Verify** (formerly Discover or Map → Implement → Validate), and the skill covers cloud-infrastructure research and data work as well as code, including workspaces that are not git repositories.
- **Tiers are chosen by consequence**, not by domain.
- **The progress log has a new format** (`▶ started  produce/fix-parser  take 1/8 · level 1/4 · haiku/low`), printed by the script, with an ASCII fallback.
- **The final report is rendered by the script**; field names changed (`Kind`, `Outcome`, `Escalations`, `Workspace`, `Secrets` are new; `Working tree` is gone).

Budget changes (units; a cheap call is 1 unit, an expensive call 8 on Claude Code and 4 on Codex):

| Tier | `escalating-subagents` | `cheap-parallel-agents` | `escalating-agents`, Claude Code | `escalating-agents`, Codex |
| ---- | ---------------------- | ----------------------- | -------------------------------- | -------------------------- |
| A | 3 | 3 | 14 | 21 |
| B | 4 | 7 | 24 | 36 |
| C | 8 | 10 | 30 | 50 |
| D | 8 | 12 | 36 | 64 |

Takes per item are new: 8 per produce item and 4 per map or verify item on Claude Code, 12 and 6 on Codex. The fixed caps of 4 writers and 3 read-only shards are replaced by the smallest of eligible items, host slots, limits the plan declares and budget admission; there is no built-in ceiling. Larger budgets come with no-progress detection that stops stuck items early.

### escalating-agents 2.0.0 (new)

- Acceptance: a PASS needs exit status 0, a command that is more than fixed text, and the plan's `check:` and `expect:` where given; a required check that was not run blocks acceptance; every validator the tier requires must pass the same frozen state; the report says `state: complete`, `incomplete (why)` or `INVALID` and lists criteria that passed only on a worker-chosen check.
- Safety: the script never executes a recorded command that looks like it changes an external system, logs every command it runs, refuses a plan line that holds a detected secret and withholds detected values from all output. Both are screens, not guarantees.
- Workspace: a change nobody dispatched blocks the next batch until `ledger.sh drift TASK accept "<who and why>"`; nothing is reverted; every report re-checks the workspace against the validated state.
- Pinning: a known mismatch stops dispatch until the user accepts it (`ledger.sh pinning TASK accept "<their words>"`); such a run is labelled.
- Width: no built-in writer ceiling; `limit <n>`, `writers <n>` and `locks: <name>` in the plan; globs that may match the same path are serialised.
- Resume: `ledger.sh reconcile TASK` records finished workers from their report files after a compaction; `result --worker <id>` stores a worker's id.

- `scripts/ledger.sh` holds the run: plan, admission, dispatch parameters, results, the effort ladder, the model gate, evidence acceptance, scope checks, the progress log, `status` for resuming after a compaction, and the final report. All run state lives in the task directory.
- `scripts/agent-snapshot.sh` is a file run by path instead of a block embedded in SKILL.md and extracted with `sed`; the SHA-256 pin is gone with the extraction. New: `init --plain` for directories that are not git repositories, and `checkpoint`, which captures a snapshot, checks changed paths against owned globs and writes the integrated patch in one call.
- Worker brief templates (`references/briefs/`) are assembled by the script; the coordinator's prompt to a worker is two lines.
- SKILL.md is 13.0 KB on Claude Code and 13.1 KB on Codex, down from 33.5 KB and 33.9 KB; everything situational moved to `references/`.
- New evidence types: `source`, `command-output`, `reconciliation`, `recompute`, `schema`. External systems are read-only unless the user authorised an action; recorded commands are scanned for changing verbs and run files for secrets.
- Codex: `agents/openai.yaml` gains a `default_prompt` and a `short_description` within the documented 25–64 characters.

### Evidence, docs, tests and evals

- `docs/evidence/frontiercode-2.0-2026-11-16.md`: rows after Cognition's 2026-11-11 rescoring, the cheap-`high` against expensive-model comparison, and the note that GPT-6.1 Terra has no row. `docs/evidence/independent-sources-2026-11-16.md`: every other source with its affiliation check, including sources excluded as affiliated. Earlier evidence files are kept.
- `docs/design/escalating-agents-2.0.md`: the design, the escalation decision and its evidence, budget arithmetic, measurements and open risks.
- Tests: byte-identical shared files, enumerated host-specific lines, forbidden models and efforts, numbers against the script and the evidence file, Codex factors within 1.5–2.0, SKILL.md size ceilings, and scenario tests of both scripts.
- Evals: the suite moves to `claude/evals/escalating-agents/` with the tag `escalating-agents` (26 cases, 23 invariant graders in each); the eleven earlier cases are migrated and new cases cover the lowest-effort start, the effort ceiling, the gate, wide dispatch, coordinator context discipline, light coordinators, small-item decomposition, the progress log, resuming, data aggregation, cloud research and a non-git workspace.

## 1.2.0 (2026-11-09)

### cheap-parallel-agents 1.1.0

- Effort ladders rest on FrontierCode 2.0 (Cognition's rebuilt 132-task suite, current since 2026-10-27) instead of
  FrontierCode 1.1. Haiku moves from `low → medium → xhigh` to `low → medium → max`: on 2.0, Haiku gains at every step,
  so `high` and `xhigh` are now skipped by design (one escalation rung, and `max` gives by far the largest gain), not
  for lack of gain. The Luna ladder stays `low → medium → max`; its skip rationale is reworded (`max` is both the
  largest gain over `medium` and the cheapest per point).
- The Codex coordinator recommendation becomes `high` (GPT-6.1 Sol `high` scores above `medium` on 2.0), including the
  recommendation given to an `ultra` parent. Sonnet stays at `high`.

### Evidence, docs and evals

- `docs/evidence/frontiercode-2.0-2026-11-09.md` preserves the 2.0 rows, deltas and the per-rung comparison.
  `docs/evidence/frontiercode-2026-11-07.md` records the 2026-11-09 verification: its rows are FrontierCode 1.1 and
  all 120 values match Cognition's file exactly.
- README: ladder table, deltas and caveats from 2.0; layout re-aligned; eval command pins `--model sonnet` and keeps
  traces; the release checklist now dates the changelog before tagging and writes release notes from it.
- Graders: the progress line accepts `haiku/max`, and `skips-high-and-xhigh` replaces `skips-high-and-max`.

## 1.1.0 (2026-11-09)

### Both skills

- Explicit invocation only. Claude Code variants set `disable-model-invocation: true` (plus an `argument-hint`), so the
  skill loads only when you type `/escalating-subagents` or `/cheap-parallel-agents`; Codex variants ship
  `agents/openai.yaml` with `allow_implicit_invocation: false`, so only a `$name` mention loads them. Descriptions no
  longer read as triggers, and the former precedence rule is replaced by an invocation rule (ask when both are invoked).
- The snapshot helper is invoked by literal absolute paths in every command, never through shell variables.

### escalating-subagents 1.1.0

- Admission counts each worker once: `workers in this batch + Implement items outside this batch not yet dispatched +
  the final Validate set`, with worked examples for tiers B, C and D. Each batch's `post-N` is captured and scope-checked
  before the next batch starts.
- Parallel execution: up to 3 read-only Discover shards per batch; Implement is parallel by default under an explicit
  eligibility rule (disjoint ownership, dependencies satisfied, no conflicting side effects) with a cap of 4 writers,
  runtime capacity as the width signal, and partial-dispatch handling; tier D or a large criteria set may split
  validation into two fresh validators that are dispatched and awaited together; the budget check becomes an admission
  formula; the final report gains a `Parallelism` field with measured values.

### cheap-parallel-agents 1.0.0 (new)

- One cheap worker model (Haiku 5.5 on Claude Code, GPT-6 Luna on Codex) with effort-only escalation
  (`low → medium → xhigh` / `low → medium → max`), parallel batches, an evidence lifecycle with frozen snapshots and
  attempt-scoped records, requested/configured/observed pinning with three verdicts, and evidence-based acceptance.
- Review fixes before first release: the Codex frontmatter is valid YAML; budget admission counts map shards and guards
  the final repair cycle (`remaining < 1 + V` stops without re-validating); Claude dispatch follows the preflight
  decision for `model` and `effort`; every brief starts with a literal `Stage | Item | Attempt | Rung` header; the
  validators of a cycle are dispatched and awaited together; snapshots are per batch, each batch's
  `post-N` is checked against that batch's ownership before the next batch and no change may appear between batches;
  the coordinator writes the integrated patch to `evidence/integrated-post-N.patch` and reads that file.

### Evals and tests

- Plugin-eval suite (`claude/evals/cheap-parallel-agents`, eleven cases) selected with `--tag`; prompts invoke the
  plugin-namespaced skill; snapshot graders accept quoted paths; repair, retry and barrier scenarios are seeded by hidden
  acceptance checks; no `llm` judge reads the truncated trace. Graders match the real trace shape: parallel calls by
  shared `message.id` across lines, and coordinator reads and the repair sequence only on main-thread lines.
- `node --test` now parses every skill's frontmatter with a strict YAML subset (and Ruby's parser when present), checks
  the invocation policy on both hosts, and statically checks the eval suite (`test/evals.test.mjs`).

## 1.0.0 (2026-11-02)

- `escalating-subagents` for Claude Code and Codex with the embedded, hash-pinned `agent-snapshot.sh` helper.
