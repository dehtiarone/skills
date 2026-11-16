# Behavioural evals for escalating-agents (Claude Code)

Format: Claude Code plugin evals. The plugin root is `claude/` (see `claude/.claude-plugin/plugin.json`), so every
prompt starts with `/dehtiarone-skills:escalating-agents`: the skill is explicit-only
(`disable-model-invocation: true`) and a prose request would never load it. Each case has a `prompt.md`, a `case.yaml`
naming `fixture.sh` (creates a small workspace in the empty eval directory), and graders that check behaviour, not
narrative: Agent tool arguments (`"model"`, `"effort"`, `"subagent_type"`), the two-line worker prompt
(`Stage: Produce | Item: … | Take: … | Level: … | Brief: …`), the coordinator's `ledger.sh` calls, tool order, the
progress lines the coordinator relays, what the coordinator itself reads, the workspace outcome, and `llm` judges over
the final report only.

## Run

From the repository root. Bash, Write, Edit and SendMessage must be granted; runs never prompt:

```bash
claude plugin eval ./claude --tag escalating-agents --model sonnet --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none --runs 3 --keep-temp
```

Run it again with `--model haiku`. The skill is written for any coordinator, so both must pass; record results per
coordinator model. Three more selections:

```bash
claude plugin eval ./claude --tag escalating-agents-light --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none --keep-temp
```

```bash
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval ./claude --case unavailable-pinning-effort-env --model sonnet --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none
```

```bash
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5 claude plugin eval ./claude --case known-mismatch-haiku-alias --model sonnet --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none
```

- `--tag escalating-agents` selects the 22 ordinary cases. Case names are directory names, so a path glob matches nothing.
- `escalating-agents-light` selects two cases whose `prompt.md` pins `model: haiku`, so a light coordinator is always
  part of the suite even when the main run uses another model.
- The two pinning cases (`escalating-agents-pinning`) take their override from the runner's shell, because case `env`
  accepts only `EVAL_*` keys while the run inherits `CLAUDE_CODE_*` and `ANTHROPIC_*` from the shell.

Three runs per case is a smoke level of evidence; raise `--runs` before a release. Known constraint: the skill writes
its task directory under `${TMPDIR:-/tmp}`; if the eval sandbox denies that location, `ledger.sh init` fails and every
case scores 0.

## Cases

| Case | What it establishes |
|---|---|
| `tier-b-parallel-two-items` | Two disjoint items go out in one message, cheap and low; one fresh validator |
| `overlapping-ownership-serialises` | Ownership is declared in the plan; overlapping items do not share a batch |
| `unsupported-pass-rejected` | A vacuous suite cannot stand in for a behavioural criterion; acceptance cites a check that ran the behaviour |
| `repair-then-fresh-validation` | A hidden suite fails take 1; the repair is a new take one level up; validation runs again |
| `retry-preserves-take-1-evidence` | A retry is a separate take; the ledger lists both |
| `blocked-check-reported` | A check that cannot run is reported unresolved; no completion claim |
| `wide-dispatch-follows-capacity` | Six disjoint items go out more than four wide |
| `snapshot-order-before-validate` | Every result is recorded before a validator starts |
| `tier-d-early-fail-barrier` | Tier D: two low validators dispatched together; repair waits for both; a reviewer replaces the coordinator's patch reading |
| `tier-d-starts-cheap-low` | Tier D's first Map, Produce and Verify dispatches are all `haiku`/`low` |
| `no-complexity-guessing` | A trivial and a hard item both start `haiku`/`low` |
| `effort-first-escalation` | A seeded shortfall moves the item to `haiku`/`medium`, with no model change |
| `environment-failure-keeps-model` | A missing tool never raises the model |
| `model-gate-honoured` | A check that never says what it wants: any `sonnet` dispatch must follow a passed gate; otherwise the item ends honestly unresolved |
| `coordinator-context-discipline` | An unknown cause is scoped by a map worker; the coordinator reads no source, patch, transcript or script |
| `small-item-decomposition` | Four independent behaviours become four parallel items |
| `resume-from-status` | The coordinator restores its state with `ledger.sh status` |
| `several-failures-then-pass` | An item that needs four takes gets them; the budget does not stop it |
| `same-failure-stops-early` | The same failure at every level stops the item through no-progress detection |
| `data-aggregation` | Four sources, parallel workers, a hidden reconciliation; the coordinator never touches the data |
| `cloud-infra-research` | A stub cloud CLI: findings from saved read-only output, no changing call, no leaked credential |
| `non-git-workspace` | A plain directory still gets snapshots and scope checks |
| `tier-b-light-coordinator`, `tier-d-light-coordinator` | The tier B and tier D cases with the coordinator pinned to Haiku |
| `unavailable-pinning-effort-env`, `known-mismatch-haiku-alias` | An effort or alias override is disclosed and reported as Known mismatch |

Every case also carries 21 common graders, the skill's invariants: every first attempt is `haiku`/`low`; no dispatch
above `high` or below `low`, or without a pinned model and effort; no `sonnet` first attempt; a `sonnet` dispatch uses
`high` and follows a passed gate for the same item; workers are `general-purpose`; validators are neither backgrounded
nor continued by message; the progress log has the documented format, every `effort` line has a reason and every
`model` line a passed gate; the final report has its fields; and the coordinator reads only run files and references,
searches nothing and does not read the scripts.

Migration from the 1.x suite: nine case names are unchanged in meaning; `retry-preserves-attempt-1-evidence` became
`retry-preserves-take-1-evidence`, `budget-exhaustion-reports` became `blocked-check-reported`,
`snapshot-timing-post-before-validate` became `snapshot-order-before-validate`, and
`reserve-arithmetic-width-shrinks` is inverted into `wide-dispatch-follows-capacity` (its old grader forbade a batch of
five; the new one requires it). The graders `never-escalates-model`, `workers-start-at-medium`, `skips-high-and-xhigh`
and `workers-are-haiku` are replaced by the common graders above; `coordinator-read-patch` and
`inspects-acceptance-record` are inverted into `coordinator-reads-only-run-files`.

## How the graders see a run

- `tool_used` and `tool_order` match `input_match` against the JSON-encoded tool input, so a quoted path appears as
  `\"…\"`. The `ledger.sh` patterns accept unquoted, quoted and `bash`-prefixed script paths; `node --test` checks
  every pattern against representative inputs (`test/evals.test.mjs`).
- `regex` graders with `target: trace` see the whole trace: one JSON-encoded stream event per line, and one content
  block per assistant event. Parallel tool calls are separate lines that share `message.id`, often with tool results
  in between, so `parallel-dispatch`, `batch-wider-than-four` and `validators-dispatched-together` match calls by
  message id across lines.
- Subagent events reach the trace with a non-null `parent_tool_use_id`. Graders about the coordinator's own behaviour
  are trace regexes restricted to lines with `"parent_tool_use_id":null`.
- The progress graders require a line in the coordinator's own text. The script printing a line is not the coordinator
  relaying it. Symbols may arrive raw or as `\uXXXX`; both are matched, as is the ASCII fallback. `node --test`
  feeds the graders the lines `ledger.sh` really prints.
- `no-expensive-before-gate` looks, for every coordinator `Agent` call on `sonnet`, for an earlier `gate 6/6` line of
  the same item. The script prints that line only after it has written `escalation.md`.
- An `llm` judge with `focus: trace` sees only the first 12 and the last 12 messages, so judges read the final report
  (`last_message`) only.
- Evidence and run state live in the task directory under `TMPDIR`, outside the workspace, so they are graded through
  the trace, not through `file` targets.

## Seeded failures

- `repair-then-fresh-validation`, `retry-preserves-take-1-evidence`, `effort-first-escalation` and
  `tier-d-early-fail-barrier` hide the expected value in a check that producers may not read, so take 1 fails unless
  the worker guesses it.
- `several-failures-then-pass` reveals one requirement per failure: three failures before the item can pass.
- `same-failure-stops-early` prints the same failure whatever is changed.
- `model-gate-honoured` reports only how far the output is from the target. A model escalation is possible but not
  forced; the graders are invariants (no expensive dispatch without a passed gate, an honest report), not a script.
- `unsupported-pass-rejected` cannot force a validator to record the vacuous suite. That a vacuous, unexecuted or
  too-weak record is rejected and moves the validator up one level is established deterministically by
  `test/ledger.test.mjs`; the eval checks that acceptance ends up resting on a real check.
- `resume-from-status` does not compact the context (the runner cannot); it tells the coordinator to treat its memory
  as unreliable and grades that state is restored with `status` before dispatching.

`node --test` confirms each seed. Graders that need a seeded event fail with `Agent called 0x` when the event did not
happen, which reads as "scenario not exercised", not as a skill defect.

## Prerequisites and results

Each run is a `claude -p` child with its own temporary home, so the `claude` binary you invoke must itself be logged in
(`claude /login` once with that binary); a signed-in desktop app session does not count, and an unauthenticated run
scores 0 with `Not logged in` on every paid grader. Keep traces (`--keep-temp`) and check three assumptions before
trusting the cross-line and main-thread graders: that the `/dehtiarone-skills:escalating-agents` prefix expands, that
the trace has one content block per assistant line, and that subagent events carry a non-null `parent_tool_use_id`.

Results land in `claude/evals/results/` (git-ignored). Record the Claude Code version (`claude --version`), the
coordinator model, the run date, and from the kept traces the coordinator's turns, its peak context, and whether a
compaction happened.
