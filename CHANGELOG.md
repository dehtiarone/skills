# Changelog

## 1.1.0 (unreleased)

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
