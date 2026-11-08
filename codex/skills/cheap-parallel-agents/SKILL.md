---
name: cheap-parallel-agents
description: Explicit-only orchestration for a repository bug fix, feature, refactor or other change on one cheap worker model (Haiku on Claude Code, Luna on Codex) with effort-only escalation, parallel batches and evidence-based acceptance. Invoke it by name; it is never applied automatically. For an ordinary change with no cost, speed or parallelism preference, escalating-subagents is the usual choice.
license: MIT
compatibility: Requires Bash 3.2+ and Git 2.31+ on macOS or Linux (Windows only via WSL), and a Codex with multi-agent tools whose `spawn_agent` accepts `model` and `reasoning_effort` for non-fork spawns, or `[agents]` defaults that select `gpt-6-luna`.
metadata:
  version: "1.1.0"
  author: dehtiarone
  repository: https://github.com/dehtiarone/skills
---

# Cheap parallel agents for Codex

Invocation: this skill runs only when the user invokes it by name; it is never applied automatically. Neither orchestration skill invokes the other, and workers invoke neither. When the user invokes both `escalating-subagents` and this skill for one task, ask which one applies before dispatching.

Assumed coordinator: the parent model as the user selected it, typically GPT-6.1 Sol; `high` is an initial effort recommendation to evaluate, not a setting this skill changes. A parent at `ultra` may delegate proactively: disclose this in the first progress line, recommend `high`, delegate only through this skill's dispatches, and account for any extra assignment under "Pinning". Record the actual parent model and effort in the ledger header. The coordinator orchestrates: classify the tier, write "Done means" criteria, decompose into items, fix interfaces and decisions, brief workers, dispatch batches, capture snapshots, inspect every acceptance record, triage, and report. It never edits product code and never reads worker transcripts. It reads evidence excerpts as acceptance requires, and the integrated patch for tier D acceptance, disputed validation, and scope violations.

Workers run on one cheap model only and execute one assigned item each. They never delegate, never invoke this or any orchestration skill, and never run the snapshot helper. Respect host permissions and collaboration mode; Plan mode permits no implementation or mutation-producing discovery.

Every criterion carries an ID and a required evidence type: `behavioral` (executed test, build or run that exercises the change), `static` (type-check or lint), `parse` (syntax or parse check), `format` (formatter check), or `inspection` (reviewed diff). Evidence weaker than the criterion's type never satisfies it; a parse check satisfies a `parse` criterion and nothing more.

## Tiers and assignment matrix

Name the tier in the first progress line. Any stage may promote it; never demote. Promotion keeps counters, adopts the higher budget, and revises criteria for affected workers. Size items to the matrix: a worker may own several files, so merge items rather than drop work. Validation runs once per cycle, after the complete implementation cycle is frozen, never per batch; intermediate batches get a captured and checked `post-N` before the next batch starts, and provisional worker records only.

| Tier | Work                                                                    | Map (read-only)              | Implement       | Validate per cycle (V)                                                                                     | Budget |
| ---- | ----------------------------------------------------------------------- | ---------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| A    | Trivial, fully specified, low-risk edit with a concrete check           | 0                            | 1 at `low`      | 0; coordinator-run post-capture check                                                                      | 3      |
| B    | Clear change                                                            | 0                            | ≤ 4 at `medium` | 1 at `medium`                                                                                              | 7      |
| C    | Unclear bug or substantial feature; default                             | ≤ 3 at `low`/`medium`        | ≤ 4 at `medium` | 1 at `medium`                                                                                              | 10     |
| D    | Auth, tenant isolation, migrations, queue/sync, production-data changes | ≤ 3 at `medium`              | ≤ 4 at `medium` | 2 at `medium` with distinct briefs (tests + criteria; spec + regressions); coordinator reads the patch      | 12     |

Each new assignment, retry, or continuation costs one call; parallel workers count individually; status messages and waits cost nothing. Let M be the shards in the map batch being admitted (0 for an implement batch), U the required implement items not yet dispatched including those in this batch (before mapping, the planned count, at least 1), and V the validators per cycle; the reserve is one repair with its revalidation, `1 + V`. **Admission** of any batch requires `remaining ≥ M + U + V + (1 + V)`; if it fails, shrink width, merge items, or both. Serialising changes concurrency, not call count: admission counts every remaining required item. Validator retries (unsupported PASS, INCONCLUSIVE) spend reserve calls. **After a FAIL** on r items: when `remaining ≥ r + V`, run the r repairs and the complete fresh validation set with no further reserve, and another FAIL ends the run with the report; when `1 + V ≤ remaining < r + V`, repair `remaining − V` items, validate, and report the rest unresolved; when `remaining < 1 + V`, stop and report the failed items unresolved without re-validating an unchanged patch. Worked examples: tier B, four items at width 4: 7 → 3 after implementers → 2 after validation → a FAIL on two items admits one repair plus one validator → 0, one item unresolved. Tier B with an unsupported PASS: 7 → 3 → 2 → fresh validator → 1 → FAIL → 1 < 2, stop. Tier C, a map batch of 3 with 4 planned items: `3 + 4 + 1 + 2 = 10` admits → 7 → implement 4 → 3 → validate → 2 → FAIL on one item → repair and validate → 0. Tier D: `3 + 4 + 2 + 3 = 12` → 9 → 5 → 3 → FAIL on one item → 0. The ladder is available only while budget admits; at maximum width the reserve admits one repair, not every rung, and the coordinator says so when it chooses width. Decomposition never adds budget.

## Effort ladder

The worker model never changes; effort does. `medium` is the default and the place to stay.

| Rung | Model        | `reasoning_effort` | Use                                                                                                                             |
| ---- | ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `gpt-6-luna` | `low`              | Mechanical work: read-only map shards, renames, moves, formatting, running a named command and reporting; no judgment calls     |
| 1    | `gpt-6-luna` | `medium`           | Default for every Discover, Implement and Validate item                                                                          |
| 2    | `gpt-6-luna` | `medium`           | Fresh worker with a concrete correction and the prior record path; the single omission retry                                    |
| 3    | `gpt-6-luna` | `max`              | Only after a confirmed reasoning failure at rung 1 or 2, or a second PARTIAL without progress                                    |

Skipped levels: `high` is skipped because its observed gain over `medium` in independent coding evaluations did not justify a rung, and `xhigh` because the ladder keeps one escalation rung and `max` bought more score per dollar. Do not fill the gap.
Rung 0 briefs say: no judgment calls; return BLOCKED when one is needed. Validators start at `medium` in every tier. A correct FAIL never escalates a validator. Environmental failures never advance rungs. There is no model escalation: when the ladder is exhausted the coordinator stops and reports.

| Finding                                                                                                        | Action                                                                                                                                                 | Counts                              |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Rung 0 worker returns BLOCKED because judgment is required                                                     | Pre-make the decision when possible; redispatch the item at rung 1                                                                                     | call; rung → 1, not a failure       |
| Rung 1 worker omits a requirement or misreads the brief                                                        | Rung 2: fresh worker with the correction and the prior record path                                                                                     | call                                |
| Confirmed reasoning failure at rung 1 or 2, or second PARTIAL without progress                                 | Rung 3                                                                                                                                                 | call + rung                         |
| PARTIAL with sound approach and progress                                                                       | Continue at the same rung                                                                                                                              | call                                |
| Validator returns unsupported PASS (evidence type too weak, stale snapshot, or a check that did not run)        | Reject; fresh validator at rung 2 with explicit evidence requirements; second occurrence → rung 3; Implement untouched                                  | call each                           |
| Validator returns a correct FAIL                                                                               | Successful validation; enter the repair cycle: failed items escalate per their own ladder, then the complete fresh validation set                       | r + V calls                         |
| Validator FAIL refuted by the coordinator with recorded evidence                                               | Record the correction; no Implement change; revalidate only if the patch changes                                                                       | none                                |
| Validator INCONCLUSIVE or BLOCKED for environmental reasons                                                    | Remedy within authorization, retry once at the same rung; unresolved checks are carried into the report as blocked                                      | call; no rung change                |
| Rung 3 fails on an item                                                                                        | Once per item: narrow the item (smaller scope, decisions pre-made) and retry at rung 1 if admission allows; the narrowed item inherits history and budget | call                                |
| Failure in the final repair cycle                                                                              | Stop; report unresolved items, evidence, and next step; no further dispatch                                                                            | none                                |
| Blocking ambiguity changes "done" or tier D risk                                                               | Ask the user; name the blocker                                                                                                                         | none                                |

## Parallel batches

An item joins a batch only when all three hold: disjoint ownership (files or globs); dependencies satisfied (interfaces fixed in the brief, no item consumes another's unfinished output); no conflicting side effects (generated files, schema or migrations, databases, ports, caches, test fixtures, CI config). Otherwise serialise or merge. Default caps, adjustable by the user, are 4 writers and 3 read-only shards per batch; they are heuristics from asynchronous-delegation research, not limits. Capacity comes from the runtime: use the host's advertised slots and its counting semantics, and dispatch `min(cap, available slots)`. Dispatch a whole batch in one message. On a partial dispatch, keep the spawned workers, register them by name, and dispatch the remainder when slots free; never re-spawn an item already running.

Every brief carries the coordinator's decisions list (names, interfaces, conventions chosen so far) because actions embed decisions and parallel workers otherwise diverge. Shared-workspace execution without worktrees is a deliberate tradeoff: ownership plus snapshot scope checks replace physical isolation.

## Evidence lifecycle and freeze

Batches are numbered across the run, map, implement and repair batches alike. Capture `base` once and `pre-N` immediately before batch N; put the snapshot name and tree ID in every brief of that batch. Map workers report against `pre-N`. Implementers' checks are provisional until validation; their records say so and name `pre-N`. After every writer and background command of batch N has stopped, capture `post-N` and check `names0 pre-N post-N` against that batch's ownership (empty for a map batch) before dispatching anything else; `names0 post-N pre-N+1` must also be empty, and any change there is an out-of-scope edit. A cycle is frozen when its last implement batch passes this check: fresh validators receive that batch's `post-N` and produce acceptance records against that frozen state, the coordinator also checks the cycle's union from its first `pre` to that `post`, and no writes happen during validation. Barrier: the validators of a cycle are dispatched together and awaited together, and no repair starts until every one of them has returned, or has been interrupted and confirmed terminated. A repair is a batch of its own: capture its `post-N`, check it, and run the complete validator set fresh. Before acceptance, capture `final`; `names0` between the validated snapshot and `final` must be empty. The helper detects changes to included files only; it does not prevent writes and does not cover excluded ignored files or external side effects, which validators list as not covered.

Tier A has no validator: the implementer makes its final write, runs the concrete check, and stops with no further writes; the coordinator captures `post-1`, then runs the concrete check itself against the captured state (or dispatches one `low` check worker within budget), and accepts only when that post-capture result supports the criterion.

Evidence paths are assignment-specific and immutable: `TASK/evidence/<item>/attempt-<k>.report.md` and `attempt-<k>.accept.md`; continuations append `attempt-<k>.cont-<j>.*`. Validators are items too (`validate`, or `validate-tests` and `validate-spec` in tier D), so the second validation cycle writes `attempt-2`. Each header binds assignment ID, item, attempt, rung, requested and configured settings, criterion IDs, and snapshot name plus tree ID. Records are never overwritten; correction briefs cite them by path. The acceptance record has one line per criterion ID: PASS, FAIL or NOT_RUN, the evidence type used, the command with exit status or `path:line`, and the snapshot. Worker returns are at most 15 lines: outcome, record path, open points, next step; no diff and no recap of the brief.

The coordinator always inspects the acceptance record and the relevant evidence excerpt (command, exit status, decisive output lines) to establish that the named check completed and supports the criterion. A path's existence is not evidence. Reject PASS or DONE whose evidence type is weaker than the criterion requires, cites a stale snapshot, or names a check that failed to start. Read detailed logs when a record is incomplete or disputed, and for tier D.

## Pinning: requested, configured, observed

For every call the ledger records the requested settings (the brief), the configured settings (what preflight established), the observed settings (what the host exposed afterwards, else `unavailable`), and one verdict: **Verified** when the host exposes matching effective settings; **Requested but unverified** when overrides were sent and effective settings are not exposed; **Known mismatch** when an override, cap, fallback, inherited or forced setting changes execution. "No mismatch observed" is never reported as "guarantees held". Disclose every Known mismatch in the first progress line and continue as best-effort cheap-worker selection; the final report names which guarantee (single cheap model, effort ladder) did not hold and why.

Preflight (Codex): read-only, before the first dispatch, inspect the exposed `spawn_agent` schema. When it accepts `model` and `reasoning_effort`, pass `model: "gpt-6-luna"`, the rung's effort, and `fork_turns: "none"`; a full-history fork rejects overrides. When the schema hides those fields or the backend rejects the override, print once the documented config the user can add (`[agents] default_subagent_model = "gpt-6-luna"` and `default_subagent_reasoning_effort = "medium"`, or a `.codex/agents/*.toml` role with `model` and `model_reasoning_effort`; the `hide_spawn_agent_metadata` feature flag is version-dependent), read `~/.codex/config.toml` and `.codex/config.toml` as configuration evidence only (profiles and startup overrides may differ), disclose that effective settings cannot be established, and continue with Requested but unverified or Known mismatch verdicts and a ladder collapsed to fresh worker plus correction. Choose any fallback effort from the intersection of host-exposed and Luna-supported levels (`low`, `medium`, `high`, `xhigh`, `max`), preferring `max`, then `high`. Never edit configuration and never spawn a nested CLI.

Extra assignments the coordinator did not dispatch (for example proactive delegation by the parent) are counted as calls when observable through the host's agent listing, with ownership recorded as unknown and their writes judged by the union scope check; when they cannot be observed, budget, usage and snapshot guarantees are marked incomplete. Nothing observed is labelled uncounted.

## Dispatch

Dispatch (Codex): use `spawn_agent` with a unique snake_case `task_name`, the complete brief in `message`, explicit `model` and `reasoning_effort` where exposed, and `fork_turns: "none"` always; use the default role for every worker, including read-only shards, which are instructed to leave the repository untouched and are checked by the `post-N` scope diff; do not invent a per-agent sandbox setting. Issue a batch as several `spawn_agent` calls, then `wait_agent` on each; a validation cycle is spawned together and every validator is awaited before anything else, so the barrier holds by construction. The session's advertised slot count, which may include the parent, is the capacity signal, and a spawn refused for capacity is dispatched later without re-spawning running items. Use `followup_task` or `send_input` only to continue a worker at the same rung on the same item; a fresh validator is always a new spawn. Report incompatible controls rather than changing configuration. Interrupt overdue workers and ensure writes stop before capturing. Read acceptance records, logs and the integrated patch file directly from disk.
Retry briefs name the correction or hypothesis and the prior record path, and say **continue the patch** or **replace these hunks**. Use a fresh worker whenever effort changes.

## Snapshots and handoffs

The parent alone runs the embedded Bash/Git snapshot script below. No companion file is needed. With `umask 077`, create `${TMPDIR:-/tmp}/cheap-parallel-agents/`, then a unique `task.XXXXXX` directory there using `mktemp -d`, and `evidence/` inside it. Extract the marked block with this command, never by retyping it (SKILL is this document's absolute path, TASK the task directory):

````text
sed -n '/^<!-- agent-snapshot:start -->$/,/^<!-- agent-snapshot:end -->$/p' SKILL | sed '1,/^```bash$/d;/^```$/,$d' > TASK/agent-snapshot.sh
````

Its SHA-256 (`shasum -a 256` or `sha256sum`) must be `ddc6cd474ae00cb7fc7613deefb4a9f5ff959f6b641abf041f1a7e26d7d8ca95`; a mismatch is a blocker. Use `<task>/state` separately for snapshots. Do not place the script inside the initially empty state directory. Run it with Bash, never source it.

Record absolute repository, helper, evidence and state paths in the parent ledger; pass them explicitly on every invocation as literal absolute paths, never through shell variables or state carried across commands. Workers receive their evidence directory path and nothing else from the task directory; they never run the helper or receive its control paths. Initialize successfully before any dispatch; report initialization errors and stop, identifying sandbox blockers only when permissions caused them. Uppercase words below are placeholders; quote actual paths:

```text
bash HELPER init REPO STATE
bash HELPER capture STATE base
bash HELPER capture STATE pre-1
bash HELPER capture STATE post-1
bash HELPER diff STATE pre-1 post-1 names0
bash HELPER diff STATE post-1 pre-2 names0
bash HELPER diff STATE pre-1 post-1 stat
bash HELPER diff STATE base post-1 patch > TASK/evidence/integrated-post-1.patch
```

Named snapshots are immutable. State persists tree IDs and temporary indexes/objects; the real index/object database is unchanged. Tracked ignored files and non-ignored untracked files are included. Do not use `git diff HEAD` as a substitute. Helper failures are blockers. It rejects concurrent writes; do not delete a lock unless its recorded process is confirmed stopped. Keep state until reporting and any intended follow-up finish.

Use NUL-delimited changed paths for scope checks, `stat` for summaries, and the integrated patch, written to `TASK/evidence/integrated-post-N.patch`, for validators and for the coordinator's own reading. Out-of-scope edits are rejected unless the parent explicitly extends ownership for a legitimate dependency. Preserve unrelated work; never automatically reset, clean, stash, or revert it. Reports provide individual attribution, not proof of authorship: judge each batch against the union of that batch's ownership. Track long-running commands to completion and stop outstanding writes before snapshotting; background launch is not completion.

## Repository constraints and briefs

Read applicable `AGENTS.md`, scoped instructions, specifications, and design guidance. Use the repository's package manager, locking, dependency-version, migration, and documentation policies. Carry production-data constraints explicitly into relevant worker briefs. Workers never commit, push, deploy, or perform unrelated external writes. The parent may perform explicitly requested actions only when repository and host rules permit them.

Every brief, including a continuation, begins with the literal header line `Stage: <Map|Implement|Validate> | Item: <id> | Attempt: <k> | Rung: <n>` and includes: task, tier, item and assignment ID, original request, absolute repository, instruction and evidence paths, requested model and effort, criteria verbatim with IDs and evidence types, the decisions list and fixed interfaces, ownership, the batch snapshot name and tree ID, command timeouts, wall-clock budget (10 minutes for A/B, 25 for C/D), production-data constraints, the report and acceptance-record paths, and "do not delegate, invoke any orchestration skill, or run the snapshot helper."

- **Map (read-only):** relevant paths and questions; owns nothing; no repository edits or installs. Report scope, cause, locations with evidence, proposed criteria, open points, next step, against `pre-N`.
- **Implement:** owned files or globs, retry patch instructions, and at rungs 0–2 this text: run a check appropriate to each criterion's evidence type before reporting it done; a check that failed to start does not count; keep working until everything asked for is done, and add no features, docs, or refactors that were not asked for. Report edits, commands with exit status, provisional checks, open points, next step.
- **Validate:** integrated patch path, specifications, implementation evidence paths, and the frozen snapshot; no repository edits or new regression tests; propose missing tests. Report evidence per criterion, regressions, untested areas, side effects not covered, and completed or outstanding checks. Do not trust implementation claims without evidence.

## Progress and final report

Emit one concise update per dispatch, handoff, triage decision, promotion, pinning disclosure, and one-call-remaining warning. Use this literal progress format, where settings show requested → observed:

```text
[tier {tier}] {stage/item} · rung {rung} ({model}/{effort} → {observed}) · call {used}/{budget} · {mm:ss} → {outcome} ({evidence}); next: {action}
```

Example:

```text
[tier B] Implement/item-2 · rung 1 (gpt-6-luna/medium → unavailable) · call 3/7 · 04:10 → accepted (2 files, attempt-1.accept.md); next: capture post-1, Validate
```

Use this literal final-report template, replacing bracketed fields. Report effort distribution as requested unless effort was observed. Use measured values where the host exposes them and label estimates; make no savings claim without a serial baseline.

```text
Tier: [A/B/C/D]
Coordinator: [actual parent model/effort]
Ledger: [stage/item/attempt | rung | requested → configured → observed | verdict | call n/N | elapsed | outcome | record path]
Pinning: [Verified n · Requested but unverified n · Known mismatch n, with causes; guarantees held or degraded]
Parallelism: [batches | observed max concurrent | measured elapsed per batch]
Effort distribution: [requested calls at low / medium / top; observed when exposed]
Verified: [criterion IDs with evidence type, result, snapshot, and who verified]
Choices: [implementation decisions]
Unresolved checks/work: [details or none]
Working tree: [git status --porcelain; names0 of validated snapshot vs final]
External actions: [actual commits/pushes/deployments/other writes or none]
Usage: [measured parent + worker tokens/cost where exposed; estimates labelled]
Post-acceptance defects: not assessed
```

## Embedded snapshot script

Extract it with the command in "Snapshots and handoffs". Any change to this block must update the pinned SHA-256 in the same edit.

<!-- agent-snapshot:start -->

```bash
#!/usr/bin/env bash
# Persistent content snapshots for the escalating-agent skills. Bash 3.2+ and Git.
set -euo pipefail
umask 077

die() { printf 'agent-snapshot: %s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'usage: agent-snapshot.sh init <repo> <state-dir>' \
    '       agent-snapshot.sh capture <state-dir> <name>' \
    '       agent-snapshot.sh diff <state-dir> <from> <to> <patch|stat|names0>' >&2
  exit 64
}

# A caller's alternate index/worktree must not redirect the repository being read.
unset GIT_DIR GIT_COMMON_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY
unset GIT_ALTERNATE_OBJECT_DIRECTORIES
export GIT_OPTIONAL_LOCKS=0
snapshot_locked=0
snapshot_work=''
snapshot_state=''
cleanup() {
  if [[ -n "$snapshot_work" ]]; then rm -rf -- "$snapshot_work"; fi
  if [[ "$snapshot_locked" == 1 ]]; then
    rm -f -- "$snapshot_state/.lock/owner"
    rmdir -- "$snapshot_state/.lock"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

lock_state() {
  mkdir -- "$snapshot_state/.lock" 2>/dev/null || die 'state is locked; another write is active or was interrupted'
  snapshot_locked=1
  printf '%s\n' "$$" > "$snapshot_state/.lock/owner"
}

repo_identity() {
  snapshot_repo=$(git -C "$1" rev-parse --show-toplevel) || die 'not a Git working tree'
  snapshot_repo=$(cd "$snapshot_repo" && pwd -P)
  snapshot_gitdir=$(git -C "$snapshot_repo" rev-parse --absolute-git-dir)
  snapshot_gitdir=$(cd "$snapshot_gitdir" && pwd -P)
  snapshot_source_objects=$(git -C "$snapshot_repo" rev-parse --path-format=absolute --git-path objects)
  snapshot_source_objects=$(cd "$snapshot_source_objects" && pwd -P)
}

check_outside_repo() {
  case "$snapshot_state/" in
    "$snapshot_repo/"*|"$snapshot_gitdir/"*|"$snapshot_source_objects/"*)
      die 'state directory must be outside the repository and Git storage' ;;
  esac
}

meta_get() {
  git config --no-includes --file "$snapshot_state/meta" --get "snapshot.$1" || die 'missing or corrupt state metadata'
}

load_state() {
  [[ -d "$1" ]] || die 'state directory does not exist; run init first'
  snapshot_state=$(cd "$1" && pwd -P)
  [[ -f "$snapshot_state/meta" ]] || die 'missing or corrupt state metadata'
  [[ "$(meta_get version)" == 1 ]] || die 'unsupported state version'
  local saved_repo saved_gitdir saved_objects
  saved_repo=$(meta_get repo)
  saved_gitdir=$(meta_get gitdir)
  saved_objects=$(meta_get sourceObjects)
  repo_identity "$saved_repo"
  [[ "$snapshot_repo" == "$saved_repo" && "$snapshot_gitdir" == "$saved_gitdir" && \
     "$snapshot_source_objects" == "$saved_objects" ]] || die 'repository identity mismatch'
  check_outside_repo
  [[ -d "$snapshot_state/objects" && ! -L "$snapshot_state/objects" && \
     -d "$snapshot_state/trees" && ! -L "$snapshot_state/trees" ]] || die 'missing or corrupt state storage'
}

snapshot_git() {
  GIT_OBJECT_DIRECTORY="$snapshot_state/objects" \
  GIT_ALTERNATE_OBJECT_DIRECTORIES="$snapshot_source_objects" \
    git -C "$snapshot_repo" -c core.fsmonitor=false -c core.untrackedCache=false \
      -c core.splitIndex=false -c core.sparseCheckout=false "$@"
}

valid_name() {
  [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || die 'snapshot names must contain only letters, digits, underscores, and hyphens'
}

read_tree() {
  valid_name "$1"
  local tree
  [[ -f "$snapshot_state/trees/$1.tree" && ! -L "$snapshot_state/trees/$1.tree" ]] || die "missing snapshot: $1"
  tree=$(cat "$snapshot_state/trees/$1.tree")
  [[ "$tree" =~ ^[0-9a-f]+$ && ( ${#tree} == 40 || ${#tree} == 64 ) ]] || die "corrupt tree ID: $1"
  [[ "$(snapshot_git cat-file -t "$tree")" == tree ]] || die "missing or corrupt tree object: $1"
  printf '%s\n' "$tree"
}

[[ $# -gt 0 ]] || usage
snapshot_command=$1
shift
case "$snapshot_command" in
  init)
    [[ $# == 2 ]] || usage
    repo_identity "$1"
    if [[ -d "$2" ]]; then
      snapshot_state=$(cd "$2" && pwd -P)
    else
      snapshot_parent=$(cd "$(dirname "$2")" && pwd -P) || die 'state parent directory does not exist'
      snapshot_state="$snapshot_parent/$(basename "$2")"
    fi
    check_outside_repo
    mkdir -p -- "$snapshot_state"
    lock_state
    if [[ -f "$snapshot_state/meta" ]]; then
      snapshot_requested_repo=$snapshot_repo
      load_state "$snapshot_state"
      [[ "$snapshot_repo" == "$snapshot_requested_repo" ]] || die 'state belongs to a different repository'
    else
      shopt -s dotglob nullglob
      for snapshot_entry in "$snapshot_state"/*; do
        [[ "$snapshot_entry" == "$snapshot_state/.lock" ]] || die 'uninitialized state directory is not empty'
      done
      mkdir -- "$snapshot_state/objects" "$snapshot_state/trees"
      snapshot_work=$(mktemp -d "$snapshot_state/write.XXXXXX")
      git config --file "$snapshot_work/meta" snapshot.version 1
      git config --file "$snapshot_work/meta" snapshot.repo "$snapshot_repo"
      git config --file "$snapshot_work/meta" snapshot.gitdir "$snapshot_gitdir"
      git config --file "$snapshot_work/meta" snapshot.sourceObjects "$snapshot_source_objects"
      mv -- "$snapshot_work/meta" "$snapshot_state/meta"
    fi
    printf '%s\n' "$snapshot_state"
    ;;
  capture)
    [[ $# == 2 ]] || usage
    load_state "$1"
    valid_name "$2"
    lock_state
    [[ ! -e "$snapshot_state/trees/$2.tree" && ! -L "$snapshot_state/trees/$2.tree" ]] || die "snapshot already exists: $2"
    snapshot_work=$(mktemp -d "$snapshot_state/write.XXXXXX")
    # Seed tracked entries, including ignored files and split-index entries, without
    # copying index extensions or writing into the real index/object database.
    git -C "$snapshot_repo" ls-files --stage -z > "$snapshot_work/entries"
    export GIT_INDEX_FILE="$snapshot_work/index"
    snapshot_git update-index -z --index-info < "$snapshot_work/entries"
    snapshot_git add -A
    snapshot_git write-tree > "$snapshot_work/tree"
    mv -- "$snapshot_work/tree" "$snapshot_state/trees/$2.tree"
    cat "$snapshot_state/trees/$2.tree"
    ;;
  diff)
    [[ $# == 4 ]] || usage
    load_state "$1"
    snapshot_from=$(read_tree "$2")
    snapshot_to=$(read_tree "$3")
    case "$4" in
      patch) snapshot_option=--binary ;;
      stat) snapshot_option=--stat ;;
      names0) snapshot_option=--name-only ;;
      *) die 'diff mode must be patch, stat, or names0' ;;
    esac
    if [[ "$4" == names0 ]]; then
      snapshot_git diff --no-ext-diff --no-textconv --no-renames --no-color "$snapshot_option" -z "$snapshot_from" "$snapshot_to"
    else
      snapshot_git diff --no-ext-diff --no-textconv --no-renames --no-color "$snapshot_option" "$snapshot_from" "$snapshot_to"
    fi
    ;;
  *) usage ;;
esac
```

<!-- agent-snapshot:end -->
