# skills

[![test](https://github.com/dehtiarone/skills/actions/workflows/test.yml/badge.svg)](https://github.com/dehtiarone/skills/actions/workflows/test.yml)
[![license](https://img.shields.io/github/license/dehtiarone/skills)](LICENSE)
[![release](https://img.shields.io/github/v/release/dehtiarone/skills)](https://github.com/dehtiarone/skills/releases/latest)

Skills for AI agents. Each skill ships one variant per host, with the same behaviour and output. Both skills are explicit-only: they run when you invoke them by name and are never applied to a request on their own.

| Skill                  | What it does                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `escalating-subagents` | Runs bug fixes, features and change requests through tiered discover / implement / validate subagents with bounded model escalation. |
| `cheap-parallel-agents` | Runs the same work on one cheap worker model only (Haiku 5.5 / GPT-6 Luna) with effort-only escalation, parallel batches, and evidence-based acceptance. |

## Which skill to invoke

Both skills load only on explicit invocation. In Claude Code type `/escalating-subagents <request>` or `/cheap-parallel-agents <request>`: the frontmatter sets `disable-model-invocation: true`, so a prose request or a `CLAUDE.md` instruction never triggers them and Claude cannot call them through the Skill tool. In Codex mention `$escalating-subagents` or `$cheap-parallel-agents`: each skill's `agents/openai.yaml` sets `allow_implicit_invocation: false`. Invoke `escalating-subagents` for an ordinary change and `cheap-parallel-agents` when cost, speed or parallelism matter. One orchestration skill applies per task; neither invokes the other, and when both are invoked for one task the skill asks which applies before dispatching.

## Layout

```text
claude/skills/<skill>/SKILL.md            Claude Code (explicit-only via disable-model-invocation)
codex/skills/<skill>/SKILL.md             Codex
codex/skills/<skill>/agents/openai.yaml   Codex invocation policy (allow_implicit_invocation: false)
CHANGELOG.md                              release notes
claude/evals/<skill>/                     behavioural eval cases (claude plugin eval); claude/ is the plugin root
codex/evals/<skill>/README.md             the same scenarios as a manual checklist for Codex
docs/evidence/                            preserved benchmark rows behind the effort ladders
test/<skill>.test.mjs, test/evals.test.mjs keeps both variants in step; checks the eval suite statically
test-support/                             shared test helper (outside test/, which node --test scans)
```

## Requirements

- Bash 3.2+ and Git 2.31+
- macOS or Linux; Windows only via WSL

## Install

Claude Code, for all projects:

```bash
cp -r claude/skills/escalating-subagents claude/skills/cheap-parallel-agents ~/.claude/skills/
```

Codex, for all projects:

```bash
cp -r codex/skills/escalating-subagents codex/skills/cheap-parallel-agents ~/.agents/skills/
```

For one project only, copy into that repository's `.claude/skills/` or `.agents/skills/` instead. Copy only the skills you want; each works alone, and `cp -r` carries the Codex `agents/openai.yaml` policy along. Both need a host with subagent tooling (Claude Code's Agent tool, Codex multi-agent); they are not for claude.ai chat.

## escalating-subagents: parallel stages

Discover may run as up to three read-only shards with disjoint questions, Implement runs in parallel by default when items have disjoint ownership, satisfied dependencies and no conflicting side effects (cap 4 writers, width bounded by the host's advertised capacity and by the call budget), and tier D may split validation into two fresh validators that are dispatched and awaited together before any repair. The final report's `Parallelism` field records batches, observed concurrency and measured elapsed time; the skill makes no savings claim without a serial baseline.

## cheap-parallel-agents: effort ladder and evidence

Workers run on one model only: `haiku` (Haiku 5.5) on Claude Code, `gpt-6-luna` on Codex. Escalation changes effort, never model: `low` for mechanical items, `medium` as the default and the place to stay, one top rung (`xhigh` on Haiku, `max` on Luna) after a confirmed reasoning failure. Haiku `high` and `max`, and Luna `high` and `xhigh`, are skipped in this policy because the observed gain did not justify another rung.

The policy rests on independent coding evaluations only. Primary source: Cognition's FrontierCode result file (`main` variant; Haiku in Claude Code, Luna in Codex), retrieved 2026-11-07. Score is the composite `new_score`, cost is mean USD per rollout; both are unrounded source values, single runs, no confidence intervals. The full rows, field mapping and a release gate to re-verify them live in [docs/evidence/frontiercode-2026-11-07.md](docs/evidence/frontiercode-2026-11-07.md).

| Model      | low             | medium          | high            | xhigh           | max             |
| ---------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| Haiku 5.5  | .3476 / $0.0596 | .4163 / $0.1300 | .4189 / $0.2560 | .4583 / $0.6297 | .4636 / $1.3284 |
| GPT-6 Luna | .2566 / $0.0199 | .3553 / $0.0512 | .3726 / $0.0646 | .3710 / $0.0700 | .4242 / $0.1027 |

Haiku: medium→high +0.26 pts at 1.97× cost and xhigh→max +0.53 pts at 2.11× are the skipped steps; medium→xhigh is +4.20 pts at 4.84×. Luna: high→xhigh is −0.16 pts at 1.08×, the skipped step; medium→max is +6.89 pts at 2.01×. Corroboration with the same shape: Hex DataBench v1.1 for Luna (xhigh equals high; max is a real step at about 3×) and Artificial Analysis for Haiku (monotonic on a general index). Caveat recorded on purpose: Sonnet 5.5 at `high` (.4938 / $0.4175) scores above Haiku at `xhigh` on this benchmark; the skill stays single-model by design and says so. Coordinator effort (Sonnet `high`, Sol `medium`) is an initial recommendation to evaluate, extrapolated from solo-coding rows that do not measure coordination quality. Cheap workers alone do not establish lower total task cost; the skill's final report measures elapsed time and observed concurrency and makes no savings claim without a serial baseline.

Orchestration rules draw on independent research used as heuristics: CAID (Geng & Neubig, arXiv 2603.21489) for fan-out caps, MAST (Cemri et al., arXiv 2503.13657) for treating verification as the failure class to over-provision, Chroma's "Context Rot" and Mittal (arXiv 2609.01660) for short focused worker episodes, and Cognition's "Don't Build Multi-Agents" for passing decisions explicitly into every brief.

### Behavioural evals

`claude/evals/cheap-parallel-agents/` holds plugin-eval cases that grade tool arguments, the literal brief header, tool order, evidence inspection and repository outcome rather than the coordinator's narrative; every prompt invokes the skill explicitly as `/dehtiarone-skills:cheap-parallel-agents`. From the repository root, with a logged-in `claude`:

```bash
claude plugin eval ./claude --tag cheap-parallel-agents --scaffold --trust-plugin --allow-tools Write Edit "Bash(*)" SendMessage --ablation none --runs 3
```

The two pinning cases (tag `cheap-parallel-agents-pinning`) take their override from the runner's shell; see `claude/evals/cheap-parallel-agents/README.md`, which also explains how graders see a run and how the repair scenarios are seeded. Three runs per case is a smoke level of evidence, not proof of reliable orchestration. Codex scenarios are a manual desktop checklist in `codex/evals/cheap-parallel-agents/README.md`.

## Test

Requires Node 22+ in addition to the requirements above; no dependencies.

```bash
node --test
```

The tests check that every skill embeds the same snapshot script, that its pinned SHA-256 and extraction command are correct, that each skill's two variants differ only in host-specific lines, that every frontmatter block parses as YAML (a strict subset parser, cross-checked with Ruby's parser when present) and carries the explicit-only policy for its host, that both skills state the same invocation rule, that the README ladder numbers match `docs/evidence/`, that the eval suite loads and its grader patterns match representative tool inputs and its fixtures seed what they claim, and that the script itself behaves correctly. Scored behavioural evals are separate (see above) and need `claude plugin eval`.

## Release checklist

1. `node --test` passes on Node 22 and 24; `claude plugin validate ./claude` passes.
2. A scored run of the eval suite with the coordinator model pinned, recorded under `claude/evals/results/` with the Claude Code version.
3. Desktop acceptance: in Claude for Mac the skills appear in the `/` menu and a prose request does not load them; in Codex inside ChatGPT for Mac `$name` loads them and an unmentioned request does not. Log versions in `codex/evals/results/`.
4. Re-download the Cognition data file and reconcile `docs/evidence/` and the ladder table above.
5. Update `CHANGELOG.md`, bump `metadata.version` where behaviour changed, tag `vX.Y.Z`.

## License

MIT
