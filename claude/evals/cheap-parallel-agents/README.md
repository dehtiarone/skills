# Behavioural evals for cheap-parallel-agents (Claude Code)

Format: Claude Code plugin evals. The plugin root is `claude/` (see `claude/.claude-plugin/plugin.json`), so every
prompt starts with `/dehtiarone-skills:cheap-parallel-agents`: the skill is explicit-only
(`disable-model-invocation: true`) and a prose request would never load it. Each case has a `prompt.md`, a `case.yaml`
naming `fixture.sh` (creates a small git repository in the empty workspace), and graders that check behaviour, not
narrative: Agent tool arguments (`"model":"haiku"`, `"effort"`), the literal brief header
(`Stage: Validate | Item: … | Attempt: … | Rung: …`), tool order (snapshot captures before validators), evidence
inspection (the coordinator's own `Read` of `attempt-N.accept.md` and of the integrated patch file), repository
outcome, and `llm` judges over the final report only.

## Run

From the repository root. Bash, Write, Edit and SendMessage must be granted; runs never prompt:

```bash
claude plugin eval ./claude --tag cheap-parallel-agents --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none --runs 3
```

`--tag` selects the nine ordinary cases. Case names are directory names, so a path glob such as
`cheap-parallel-agents/*` matches nothing. The two pinning cases carry the tag `cheap-parallel-agents-pinning` and take
their override from the runner's shell, because case `env` accepts only `EVAL_*` keys while the run inherits
`CLAUDE_CODE_*` and `ANTHROPIC_*` from the shell:

```bash
CLAUDE_CODE_EFFORT_LEVEL=low claude plugin eval ./claude --case unavailable-pinning-effort-env --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none
```

```bash
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5 claude plugin eval ./claude --case known-mismatch-haiku-alias --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none
```

Pin `--model` to the coordinator you ship for (latest Sonnet) so a model rollout is not mistaken for a skill regression.
Three runs per case is a smoke level of evidence, not proof of reliable orchestration; raise `--runs` before a release.
If `claude plugin eval` is unavailable on the machine, run the same scenarios by hand from
`codex/evals/cheap-parallel-agents/README.md`, which lists what to inspect for each case. Known constraint to verify on
first run: the skill writes its task directory under `${TMPDIR:-/tmp}`; if the eval sandbox denies that location, the
skill reports an initialization blocker and every case scores 0.

## How the graders see a run

- `tool_used` and `tool_order` match `input_match` against the JSON-encoded tool input, so a quoted path appears as
  `\"…\"`. The snapshot patterns accept unquoted, double-quoted and single-quoted helper paths, including paths with
  spaces; `node --test` checks every pattern against representative inputs (`test/evals.test.mjs`).
- `regex` graders with `target: trace` see the whole trace: one JSON-encoded stream event per line, and one content
  block per assistant event. Parallel tool calls are separate lines that share `message.id`, often with tool results
  in between, so `parallel-dispatch`, `no-batch-of-five` and `no-concurrent-greet-owners` match calls by message id
  across lines rather than within one line.
- Subagent events reach the trace with a non-null `parent_tool_use_id`, and `tool_used` counts every tool call
  regardless of who made it. Graders about the coordinator's own reads (`inspects-acceptance-record`,
  `reads-attempt-2-record`, `coordinator-read-patch`) and the repair sequence (`revalidated-after-repair`) are
  therefore trace regexes restricted to lines with `"parent_tool_use_id":null`. Writing the patch with a shell
  redirect does not count as reading it; the skill writes `evidence/integrated-post-N.patch` and then reads that file.
- An `llm` judge with `focus: trace` sees only the first 12 and the last 12 messages, so no judge in this suite reads
  the trace: ordering is graded with `tool_order` and trace regexes, and judges read the final report
  (`last_message`) only.
- Snapshots are per batch: `pre-N` and `post-N` number every map, implement and repair batch across the run, so a
  validator may receive `post-2` or `post-3` in cycle 1. Graders therefore match `post-\d+`, and the second validation
  cycle is recognised by its `Attempt: 2` (or later) validator header after the repair and a fresh capture.
- The skill dispatches the validators of a cycle in one message without `run_in_background`, so the barrier before a
  repair holds by construction; `validators-not-backgrounded` fails a run that backgrounds a validator, and
  `revalidated-after-repair` requires the repair, then a fresh `post-N` capture, then a cycle-2 validator.

## Seeded failures

`repair-then-fresh-validation`, `retry-preserves-attempt-1-evidence` and `tier-d-early-fail-barrier` need a correct FAIL
in the first validation cycle. Their fixtures hide the acceptance check (an expected string, or an index name, that only
the hidden check contains) and the prompt forbids implementers to read or run it, so the first attempt fails
deterministically unless the implementer guesses the hidden value. `node --test` confirms each seed. The repair graders
require the repair to have happened; when a first cycle passes by luck they fail with `Agent called 0x`, which reads as
"scenario not exercised", not as a skill defect.

## Prerequisites and results

Each run is a `claude -p` child with its own temporary home, so the `claude` binary you invoke must itself be logged in
(`claude /login` once with that binary); a signed-in desktop app session does not count, and an unauthenticated run
scores 0 with `Not logged in` on every paid grader. Checked on 2026-11-08 under Claude Code 2.1.317: all eleven cases
load, `--tag` and `--case` select them as documented, and every grader executes. No scored run has been recorded yet. The
first scored run must also confirm three assumptions about the eval child: that the
`/dehtiarone-skills:cheap-parallel-agents` prefix expands, that its trace has one content block per assistant line as
Claude Code transcripts do, and that subagent events carry a non-null `parent_tool_use_id`. Keep that run's trace
(`--keep-temp`) and check it before trusting the cross-line and main-thread graders.

Results land in `claude/evals/results/` (git-ignored). Record the Claude Code version (`claude --version`, or `/status`
inside a desktop Code session), the coordinator model and effort, and the run date alongside the results.
