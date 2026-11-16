# Manual checklist for escalating-agents (Codex)

Codex has no eval runner for skills, so these are the same scenarios as `claude/evals/escalating-agents/`, run by
hand in **Codex inside ChatGPT for Mac** (primary) or `codex` on the command line with the parent pinned
(`-m <model> -c model_reasoning_effort=<effort>`, supplemental). Run the starred cases under three parents: GPT-6.1
Sol, GPT-6.1 Terra and GPT-6 Luna. The skill is written for any of them. Before a run, note the controls the session
exposes: ask the agent to print the `spawn_agent` tool's fields and the advertised slot count. Inspect behaviour, not
the narrative.

## Fixture

Create an empty directory and run the matching `fixture.sh` from the Claude case directory (plain Bash and Git). Then
paste the case's prompt from its `prompt.md`: only the text after the frontmatter block, with the leading
`/dehtiarone-skills:escalating-agents` replaced by `$escalating-agents`. The two Claude `-light-coordinator` cases are
the starred rows below, run under a light parent. The skill is explicit-only on Codex (`agents/openai.yaml` sets
`allow_implicit_invocation: false`), so the mention is required.

## Invariants to check in every case

- Every first spawn of every worker uses `model: gpt-6-luna`, `reasoning_effort: low` and `fork_turns: "none"`,
  whatever the tier or stage, validators included.
- No spawn uses an effort above `high` or below `low`, and no spawn omits `model` or `reasoning_effort` while the
  schema accepts them.
- `gpt-6.1-terra` appears only at `high`, only for a produce item, and only after `ledger.sh gate` printed
  `model … gate 6/6 · escalation.md` for that item. No other model appears.
- The `message` of each spawn is the two printed lines: the shared instruction line, then
  `Stage: … | Item: … | Take: … | Level: … | Brief: …`. The printed dispatch block says `reasoning_effort=`, not
  `effort=`, and marks validators `barrier=yes`.
- Validators are fresh `spawn_agent` calls, never a `followup_task` to an earlier worker, and no other tool call is
  made until every validator of the cycle has returned.
- The coordinator runs `ledger.sh` and reads nothing else from the workspace: no source file, patch, data file,
  transcript or script.
- Progress is the script's log lines, relayed unchanged; `effort` lines end with a reason; the final report has the
  fields of `references/report.md`.

## What to inspect per case

| Case | Inspect |
|---|---|
| explicit-invocation (Codex only) | With the skill installed, the same prompt without `$escalating-agents` does not load the skill (no `ledger.sh` call); with the mention it does. |
| tier-b-parallel-two-items ★ | Two spawns in one turn at `gpt-6-luna`/`low`; `ledger.sh result` for both before the validator; a new spawn for `Stage: Verify`; both scripts changed. |
| overlapping-ownership-serialises | The plan declares `owns:`; only one worker owns `bin/greet` at a time; both behaviours land. |
| unsupported-pass-rejected | The vacuous `test/run.sh` is not what acceptance rests on: the criterion names a check that runs `bin/greet` with an argument. |
| repair-then-fresh-validation | The hidden `test/run.sh` fails take 1; take 2 is a new spawn at `medium`; a fresh validator runs afterwards. |
| retry-preserves-take-1-evidence | Take 1 and take 2 have separate record files under the task directory; the Ledger lists both. |
| blocked-check-reported | The missing `frobnicate-9000` check is reported under "Unresolved checks/work"; no completion claim. |
| environment-failure-keeps-model | With `test/run.sh` as the named check, the item ends blocked or stopped on `gpt-6-luna`; no `gpt-6.1-terra` spawn and no level 4. |
| wide-dispatch-follows-capacity | Six items go out as wide as the advertised slots allow (pass `--slots`), not capped at four. |
| snapshot-order-before-validate | Every `ledger.sh result` of the batch precedes the validator spawn; `report` follows validation. |
| tier-d-early-fail-barrier | `tier D` in the run line; `verify/checks` and `verify/review` spawned together and both awaited; no repair until both returned; both run again after the repair; column and index present. |
| tier-d-starts-cheap-low ★ | First Map, Produce and Verify spawns all at `gpt-6-luna`/`low`; two validators. |
| no-complexity-guessing | The trivial and the hard item both start at `gpt-6-luna`/`low`. |
| effort-first-escalation | Take 2 is `gpt-6-luna`/`medium`; no Terra spawn. |
| model-gate-honoured | Any Terra spawn follows a `gate 6/6` line for that item and `escalation.md` exists; on Codex the gate needs five cheap takes; otherwise the item ends unresolved and the report says so. |
| coordinator-context-discipline | A `Stage: Map` spawn scopes the bug; the coordinator opens no source file. |
| small-item-decomposition | Four produce items in the plan and four parallel spawns. |
| resume-from-status | `ledger.sh status` is run before each dispatch. Also try a real compaction mid-run (`/compact`) and confirm the run continues from `status`. |
| several-failures-then-pass | The item reaches take 4 or later and passes; nothing stops for budget (tier B budget is 36 units, 12 takes per item). |
| same-failure-stops-early | The item stops with "no progress" after about four takes; no Terra spawn. |
| data-aggregation | `--kind data`; parallel collectors; `out/totals.csv` reconciles with `checks/reconcile.sh`; the coordinator never opens a source file. |
| cloud-infra-research | `--kind infra`; `tools/aws-calls.log` has only read-only calls; the fake secret (export `EVAL_AWS_SECRET_ACCESS_KEY` before starting) is in neither `report/findings.md` nor the final report. |
| non-git-workspace | `init` prints `plain snapshots`; no `.git` appears in the directory. |
| larger budgets (Codex only) | `ledger.sh numbers codex` prints budgets 21 / 36 / 50 / 64, 12 and 6 takes, and an expensive-call weight of 4; the run line shows the tier's budget. |
| terra-pinning (Codex only) | In a run that reaches the gate, the Terra spawn carries `model: gpt-6.1-terra`, `reasoning_effort: high`; record what the host shows as effective settings and whether `--ran` was used. |
| hidden-override-path (counterpart of the two Claude pinning cases) | With `spawn_agent` hiding `model`/`reasoning_effort`, the coordinator runs `ledger.sh pinning TASK mismatch "…"`, shows the configuration from `references/pinning.md` (`[agents] default_subagent_model`, `default_subagent_reasoning_effort`, or `.codex/agents/*.toml` roles) once and continues; the log has a `blocked pinning known mismatch` line and the report says `Pinning: Known mismatch`. |
| ultra-parent (Codex only) | With the parent at `ultra`, the coordinator says in its first message that the parent may delegate on its own, and the report marks budget and snapshot statements incomplete for any worker it did not dispatch. |

## Results log template

```text
Date:
App: ChatGPT for Mac <version> · Codex engine <version from the session>
Parent selected: <model/effort as shown in the app>
spawn_agent fields exposed: <list>
Advertised slots: <n, parent included or excluded>
Case | Parent | Outcome | Spawns | First attempts luna/low? | Terra only after gate? | Units used/budget | Coordinator turns | Compaction? | Notes
```

Keep logs under `codex/evals/results/` (git-ignored). Machine-specific versions belong here, not in the skill text.
