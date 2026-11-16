# skills

[![test](https://github.com/dehtiarone/skills/actions/workflows/test.yml/badge.svg)](https://github.com/dehtiarone/skills/actions/workflows/test.yml)
[![license](https://img.shields.io/github/license/dehtiarone/skills)](LICENSE)
[![release](https://img.shields.io/github/v/release/dehtiarone/skills)](https://github.com/dehtiarone/skills/releases/latest)

Skills for AI agents. Each skill ships one variant per host, with the same method and output.

| Skill               | What it does                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `escalating-agents` | Splits a code change, a cloud-infrastructure research or audit task, or a data aggregation task into small items for parallel cheap subagents, and raises effort, then model, only on recorded evidence. |

Version 2.0.0 replaces `escalating-subagents` and `cheap-parallel-agents` with this one skill; see [CHANGELOG.md](CHANGELOG.md) for the migration.

## What it is for

In priority order: the cheapest execution that still meets the acceptance criteria; the shortest wall-clock time; the shortest coordinator context; and any coordinator model, from Opus or GPT-6.1 Sol down to Haiku or GPT-6 Luna. The coordinator plans and relays. Cheap subagents read, produce and verify, and a script decides everything mechanical: which model and effort a worker gets, whether the budget admits a batch, what a failure means, and whether a result is supported by evidence.

It handles three kinds of task with the same rules:

| Kind                               | Typical items                                                   | Typical evidence                                                        |
| ---------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Code change                        | fix, feature, refactor                                          | executed tests, build, lint                                             |
| Cloud infrastructure research      | inventory accounts and regions, compare configurations, findings | saved output of read-only CLI or API calls, cited documentation         |
| Data aggregation and processing    | collect, transform, join, dedupe, summarise                     | schema checks, reconciliation against source totals, sample re-computation |

## Invoking it

The skill is explicit-only: it runs when you invoke it by name and is never applied to a request on its own. In Claude Code type `/escalating-agents <task>` (as a plugin: `/dehtiarone-skills:escalating-agents <task>`); the frontmatter sets `disable-model-invocation: true`. In Codex mention `$escalating-agents`; `agents/openai.yaml` sets `allow_implicit_invocation: false`.

## Ladders

Every subagent, in every tier and stage, starts on the cheap model at `low` effort. The coordinator never picks a model or effort and never estimates difficulty: results move an item up. Subagent effort is `low`, `medium` or `high` only.

| Level | Claude Code        | Codex                     | Reached by                                                    |
| ----- | ------------------ | ------------------------- | ------------------------------------------------------------- |
| 1     | `haiku` / `low`    | `gpt-6-luna` / `low`      | every first attempt                                           |
| 2     | `haiku` / `medium` | `gpt-6-luna` / `medium`   | any failed, blocked, unusable or stalled take at level 1      |
| 3     | `haiku` / `high`   | `gpt-6-luna` / `high`     | one confirmed shortfall at level 2                            |
| 4     | `sonnet` / `high`  | `gpt-6.1-terra` / `high`  | produce items only, through the gate; one take, then it stops |

Validators and read-only map items never use the expensive model. There is no third model.

### The gate, in plain words

Moving up in effort is easy: one failed take is enough, and at the lowest level it needs no diagnosis. Moving one item to the expensive model is hard. The script allows it only when all six of these are on record, and it writes them to `TASK/evidence/<item>/escalation.md` before any expensive dispatch:

1. The cheap model was tried at its top effort, and at least four cheap takes were used (five on Codex).
2. Every retry carried a correction that cites the previous attempt's record.
3. The failure is a capability failure, as diagnosed by a separate read-only worker. An omission, a broken environment, a flaky or empty check, an unclear specification or an ownership conflict never escalates the model.
4. The failure is confirmed independently: a failing check the script re-ran, or a fresh validator's reproduced FAIL. A worker's own claim is not enough.
5. Making the item smaller was tried once and failed, or is recorded as impossible.
6. The budget still covers the expensive call and the validation after it.

The expensive model then gets one take at `high`. Restarting it at `low` was rejected on independent evidence: Sonnet 5.5 at `low` and `medium` scores below Haiku 5.5 at `high` on coding. Status of that evidence: solid for the Claude pair on coding; GPT-6.1 Terra has no FrontierCode row, so its rung rests on Artificial Analysis and is an initial recommendation to evaluate; for research and data work every coding number is only a proxy.

## Budgets

A cheap call costs 1 unit; an expensive call costs 8 on Claude Code and 4 on Codex. A budget is a cap, not a target, and stuck items stop early.

| Tier | Chosen when                                                                                                  | Claude Code budget | Codex budget | Validators |
| ---- | ------------------------------------------------------------------------------------------------------------ | ------------------ | ------------ | ---------- |
| A    | one trivial, fully specified, reversible item with a concrete check                                          | 14                 | 21           | none: the script re-runs the check |
| B    | a clear task that can be planned from the request                                                            | 24                 | 36           | 1          |
| C    | unknown scope or cause, or a substantial task; the default                                                   | 30                 | 50           | 1          |
| D    | production or shared systems, irreversible or costly changes, secrets or personal data, numbers people act on | 36                 | 64           | 2          |

Takes per item: 8 for a produce item and 4 for a map or verify item on Claude Code; 12 and 6 on Codex. Batch width is the smallest of eligible items, the host's free slots, six writers, and what the budget admits.

## Evidence

The ladders rest on evaluations that are not published, run, funded or curated by Anthropic or OpenAI; each source's affiliation is recorded. Primary coding source: Cognition's FrontierCode 2.0 result file (132 tasks; Claude Code and Codex harnesses), retrieved 2026-11-16 after Cognition rescored every result on 2026-11-11. Score is the composite `new_score`, cost is mean USD per rollout, at the precision the file publishes; single runs, no confidence intervals. Full rows: [docs/evidence/frontiercode-2.0-2026-11-16.md](docs/evidence/frontiercode-2.0-2026-11-16.md). Every other source, with its affiliation check: [docs/evidence/independent-sources-2026-11-16.md](docs/evidence/independent-sources-2026-11-16.md). The design and its reasoning: [docs/design/escalating-agents-2.0.md](docs/design/escalating-agents-2.0.md).

| Model        | low            | medium         | high           |
| ------------ | -------------- | -------------- | -------------- |
| Haiku 5.5    | .1059 / $0.065 | .1405 / $0.097 | .1927 / $0.139 |
| GPT-6 Luna   | .0405 / $0.023 | .1612 / $0.092 | .1650 / $0.115 |
| Sonnet 5.5   | .0966 / $0.369 | .1496 / $0.482 | .2295 / $1.066 |

GPT-6.1 Terra is not in the file. What the numbers do and do not show:

- Haiku gains at every step. Luna gains almost everything from `low` to `medium`; its `low` is very weak on tasks of this size.
- Starting at `low` is a design rule, not a benchmark result. On FrontierCode-sized tasks it saves a little on Haiku and is about cost-neutral, and slower, on Luna. The skill's items are much smaller than these tasks, which no independent source measures.
- Cheap workers alone do not establish lower total cost. The final report records elapsed time, concurrency and units, and makes no savings claim without a serial baseline.

Orchestration rules use independent research as heuristics: a small writer ceiling (CAID, arXiv 2603.21489, improved from two to four parallel engineers and fell at eight); verification by executed checks rather than a model's judgment (MAST, arXiv 2503.13657; AgentRewardBench, arXiv 2504.08942); decomposing after a failure before changing model (ADaPT, arXiv 2311.05772); a fresh start for the stronger model (SWE-Router, arXiv 2607.00053); few dependent steps per worker (Sinha et al., arXiv 2509.09677).

## Layout

```text
claude/skills/escalating-agents/           Claude Code variant
codex/skills/escalating-agents/            Codex variant (adds agents/openai.yaml)
  SKILL.md                                 the run loop, tiers, ladder, numbers, dispatch
  scripts/ledger.sh                        admission, ladder, gate, evidence checks, log, status, report
  scripts/agent-snapshot.sh                immutable workspace snapshots, git or plain directory
  references/                              loaded only when their situation arises
  references/briefs/                       worker brief templates, assembled by the script
claude/evals/escalating-agents/            behavioural eval cases (claude plugin eval); claude/ is the plugin root
codex/evals/escalating-agents/README.md    the same scenarios as a manual checklist for Codex
docs/design/                               design note
docs/evidence/                             preserved benchmark rows and the source index
test/                                      node --test suites
test-support/                              shared test helpers (outside test/, which node --test scans)
```

Everything under a skill directory except `SKILL.md`, `references/pinning.md` and `agents/` is byte-identical on both hosts.

## Requirements

- Bash 3.2+ and Git 2.31+
- macOS or Linux; Windows only via WSL
- A host with subagent tooling: Claude Code 2.1.293+ (Agent tool with `model` and `effort`), or Codex 0.155.0+ with multi-agent tools. Not for claude.ai chat.

## Install

Copy the whole skill directory, including `scripts/` and `references/`.

Claude Code, for all projects:

```bash
cp -R claude/skills/escalating-agents ~/.claude/skills/
```

Codex, for all projects:

```bash
cp -R codex/skills/escalating-agents ~/.agents/skills/
```

For one project only, copy into that repository's `.claude/skills/` or `.agents/skills/` instead. Claude Code can also load `claude/` as a plugin (`claude --plugin-dir ./claude`).

## Behavioural evals

`claude/evals/escalating-agents/` holds plugin-eval cases that grade tool arguments, script calls, tool order and the workspace outcome rather than the coordinator's narrative. From the repository root, with a logged-in `claude`:

```bash
claude plugin eval ./claude --tag escalating-agents --model sonnet --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none --runs 3 --keep-temp
```

Repeat with `--model haiku`: the skill must hold under a light coordinator. The suite's README explains the graders, the seeded failures and the pinning cases. Three runs per case is a smoke level of evidence. Codex scenarios are a manual checklist in `codex/evals/escalating-agents/README.md`.

## Test

Requires Node 22+ in addition to the requirements above; no dependencies.

```bash
node --test
```

The tests check that the shared files are byte-identical across hosts and that `SKILL.md` differs only in enumerated host-specific lines; that the frontmatter parses and is explicit-only on each host; that no forbidden model or effort appears in a ladder or brief template; that the numbers in `SKILL.md` and this README match the script and `docs/evidence/`; that the Codex budgets and take limits stay within 1.5–2.0 times the Claude values; that `SKILL.md` stays under its size ceiling; and that both scripts behave, including the ladder, the gate, evidence checks, scope checks, plain-directory snapshots and the progress log. The eval suite is checked statically. Scored behavioural evals are separate and need `claude plugin eval`.

## Release checklist

1. `node --test` passes on Node 22 and 24; `claude plugin validate ./claude` passes.
2. A scored run of the eval suite with the coordinator pinned to `sonnet` and again to `haiku`, recorded under `claude/evals/results/` with the Claude Code version; check the kept traces for coordinator turns, peak context and compactions.
3. Desktop acceptance: in Claude for Mac the skill appears in the `/` menu and a prose request does not load it; in Codex inside ChatGPT for Mac `$escalating-agents` loads it and an unmentioned request does not. Log versions in `codex/evals/results/`.
4. Re-download the data file that Cognition's leaderboard page currently loads (`https://cognition.com/data/frontier-code-2.0/data.json` as of 2026-11-16), check for a GPT-6.1 Terra row, and reconcile `docs/evidence/` and the table above.
5. Bump `metadata.version` and the plugin manifest where behaviour changed, replace `(unreleased)` in the `CHANGELOG.md` heading with the release date, merge, then tag `vX.Y.Z` on the merge commit.
6. Create the GitHub release from that version's `CHANGELOG.md` section rather than the auto-generated notes.

## License

MIT
