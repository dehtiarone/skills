# Manual checklist for cheap-parallel-agents (Codex)

Codex has no eval runner for skills, so these are the same scenarios as `claude/evals/cheap-parallel-agents/`, run by
hand in **Codex inside ChatGPT for Mac** (primary) or `codex` on the command line with the model and effort pinned
(`-m gpt-6.1-sol -c model_reasoning_effort=medium`, supplemental). Before a run, select the coordinator in the app and
note the controls the session actually exposes: ask the agent to print the `spawn_agent` tool's fields and the
advertised slot count. Inspect behaviour, not the narrative.

## Fixture

Create an empty git repository and run the matching `fixture.sh` from the Claude case directory (they are plain Bash and
Git). Then paste the case's prompt from its `prompt.md`, replacing the leading `/dehtiarone-skills:cheap-parallel-agents`
with `$cheap-parallel-agents`. The skill is explicit-only on Codex (`agents/openai.yaml` sets
`allow_implicit_invocation: false`), so the mention is required, not optional.

## What to inspect per case

| Case | Inspect |
|---|---|
| explicit-invocation (Codex only) | With the skill installed, the same prompt without `$cheap-parallel-agents` does not load the skill (no `Stage:` briefs, no snapshot helper); with the mention it does. |
| tier-b-parallel-two-items | Two `spawn_agent` calls in one turn with `model: gpt-6-luna`, `reasoning_effort: medium`, `fork_turns: "none"`, each brief starting `Stage: Implement \| Item: … \| Attempt: 1 \| Rung: 1`; `post-1` captured after both `wait_agent` returned; a new spawn for the validator (`Stage: Validate`); `bin/greet` and `bin/farewell` changed; final report fields present, including `Parallelism`. |
| overlapping-ownership-serialises | Only one worker owns `bin/greet` at a time; the coordinator says why; both changes land. |
| unsupported-pass-rejected | The vacuous `test/run.sh` (exit 0, runs nothing) is not accepted as behavioral evidence; acceptance rests on a check that ran the new behaviour. |
| repair-then-fresh-validation | The hidden `test/run.sh` makes the first validation FAIL; the repair brief (`Attempt: 2`) cites `attempt-1.*.md`; `post-2` is captured; a fresh validator is spawned against `post-2`; the implementer never validates itself. |
| budget-exhaustion-reports | The missing `frobnicate-9000` check is reported under "Unresolved checks/work"; no completion claim. |
| reserve-arithmetic-width-shrinks | At most 7 assignments; items merged so no batch has five workers; the width decision is stated before dispatch; one validator still runs; all five scripts changed. |
| snapshot-timing-post-before-validate | `pre-N` before each batch and `post-N` after its writers stop, with that batch's scope checked before the next batch; the validator receives the last batch's `post-N`; `final` captured and `names0 post-N final` empty before acceptance. |
| tier-d-early-fail-barrier | `[tier D]` named; two validators per cycle spawned together and both awaited; the hidden `db/checks/check_index.sh` fails fast while `check_schema.sh` sleeps; no repair until both returned; both validators re-run after the repair against `post-2`; the coordinator itself read `evidence/integrated-post-N.patch` (a validator reading it, or a redirect alone, does not count); column and `idx_users_tenant_email` index present. |
| retry-preserves-attempt-1-evidence | Retry briefs cite `attempt-1` paths; `attempt-2` files are separate; the ledger lists both. |
| hidden-override-path (Codex only) | With `spawn_agent` hiding `model`/`reasoning_effort`, the config notice (`[agents] default_subagent_model`, `default_subagent_reasoning_effort`, or a `.codex/agents/*.toml` role) appears once; the run continues; verdicts are Requested but unverified or Known mismatch; the report says which guarantee did not hold. |
| ultra-parent (Codex only) | With the parent at `ultra`, the first progress line discloses proactive delegation and recommends `medium`; any extra assignment visible in `list_agents` is counted and its writes judged by the union scope check. |

## Results log template

```text
Date:
App: ChatGPT for Mac <version> · Codex engine <version from the session>
Coordinator selected: <model/effort as shown in the app>
spawn_agent fields exposed: <list>
Advertised slots: <n, parent included or excluded>
Case | Outcome | Assignments | Validators fresh and awaited together? | Snapshots in order? | Pinning verdicts | Notes
```

Keep logs under `codex/evals/results/` (git-ignored). Machine-specific versions belong here, not in the skill text.
