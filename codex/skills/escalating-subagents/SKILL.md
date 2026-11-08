---
name: escalating-subagents
description: Explicit-only orchestration for a repository bug fix, feature or change through tiered discover, implement and validate subagents with bounded model escalation; trivial edits go to a single worker. Invoke it by name; it is never applied automatically.
license: MIT
compatibility: Requires Bash 3.2+ and Git 2.31+ on macOS or Linux; Windows only via WSL.
metadata:
  version: "1.1.0"
  author: dehtiarone
  repository: https://github.com/dehtiarone/skills
---

# Escalating subagents for Codex

Recommended coordinator: `gpt-6.1-sol` at low effort. Keep the parent's selected model; this skill does not change it. The main agent orchestrates: choose the tier, define acceptance criteria, brief workers, check handoffs, triage, and report. It never edits product code. Start from compact reports (at most 30 lines), scope diffs, and evidence paths; inspect more code or run checks when evidence is missing, disputed, or insufficient for tier D risk. Do not mechanically repeat checks on an unchanged patch.

Workers execute one assigned stage and never delegate or invoke this skill. Respect host permissions and collaboration mode; Plan mode permits no implementation or mutation-producing discovery.

Invocation: this skill runs only when the user invokes it by name; it is never applied automatically. Neither orchestration skill invokes the other, and workers invoke neither. When the user invokes both `cheap-parallel-agents` and this skill for one task, ask which one applies before dispatching.

## Tiers

Name the tier in the first progress line. Any stage may promote it; never demote. On promotion, retain counters, use the higher tier's total budget, and revise criteria for every affected worker. For D, raise Discover/Validate to at least rung 3; never lower an existing rung. Perform newly required discovery before further implementation.

| Tier | Work                                                                    | Flow                                 | Starting rung                    |
| ---- | ----------------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| A    | Trivial, fully specified, low-risk edit with a concrete check           | Implement; handoff replaces Validate | 1                                |
| B    | Clear change benefiting from delegation                                 | Implement → Validate                 | 1 for both                       |
| C    | Unclear bug or substantial feature; default                             | Discover → Implement → Validate      | 1 for all                        |
| D    | Auth, tenant isolation, migrations, queue/sync, production-data changes | Discover → Implement → Validate      | Discover/Validate 3; Implement 1 |

## Stages and checks

1. **Acceptance criteria - parent:** define "Done means" before dispatch. A/B derive checks and expected outcomes from the request; C/D refine the draft after Discover. Implement and Validate receive identical criteria and the original request.
2. **Discover - C/D:** confirm scope or reproduce the issue. Up to 3 read-only shards may run as one batch when their questions or paths are disjoint; each shard is a call at the stage rung and reports against `pre-N`; a shard that writes repro or test files owns them exclusively. No product edits; explicitly owned repro/test files are allowed. Report cause/scope with locations, evidence, proposed criteria, and open questions. For read-only discovery, prohibit repository edits in the brief and verify scope; do not invent a per-agent sandbox setting. Spawn each shard with its own `spawn_agent` call and the read-only brief.
3. **Implement:** change only owned files; report edits, commands, exit status, and unfinished work.
4. **Validate - B/C/D:** a fresh agent that did not implement checks the integrated patch against the request, specifications, and criteria. No repository edits or new regression tests; propose missing tests for Implement. Scratch reports and normal test artifacts are allowed. Report evidence per criterion and untested areas. Tier D, or a criteria set too large for one brief, may split validation into at most two fresh validators with distinct briefs (tests and criteria; specification and regressions), dispatched together and awaited together; no repair starts until every validator of the cycle has returned, and after a repair the complete set runs fresh. Each validator is a call, and a validation cycle never overlaps the next Implement batch.

Preflight test prerequisites before committing to commands. Prefer feasible alternatives only when their coverage is equivalent. Never substitute unit tests for required integration, end-to-end, visual, or device evidence merely to obtain PASS. Carry blocked required checks into the final outcome; do not assume any particular test runner can run in the sandbox. Retry environmental failures only after a concrete remedy.

Discover/Implement return DONE, PARTIAL, or BLOCKED. Validate returns PASS, FAIL, BLOCKED, or INCONCLUSIVE. Time budgets per call: A/B 10 minutes; C/D 25 minutes. At the limit, return PARTIAL or INCONCLUSIVE with completed work, evidence, outstanding checks, and the next step.

## Ladder and dispatch

| Rung | Model         | `reasoning_effort` |
| ---- | ------------- | ------------------ |
| 1    | `gpt-6-luna`  | `medium`           |
| 2    | `gpt-6-luna`  | `medium`           |
| 3    | `gpt-6.1-sol` | `low`              |
| 4    | `gpt-6.1-sol` | `medium`           |
| 5    | `gpt-6.1-sol` | `high`             |

Rung 2 is a fresh Luna retry with concrete correction evidence. Sol `low` is Light in the app, not an additional rung.
For a concrete omission or misread brief, advance one rung; rung 2 is the single omission retry before the stronger model. For a confirmed reasoning failure at rung 1 or 2, jump directly to rung 3. At rung 3 or above, advance one rung. "Escalate" below means this rule. Stop when inadequate work exhausts rung 5. Productive continuations and corrected environmental failures do not advance rungs. Do not retry the same failed approach without a concrete correction; escalate instead. This does not prohibit productive continuations.

Use the exposed Codex schema: `spawn_agent` with a unique `task_name`, complete brief in `message`, explicit `model`, `reasoning_effort`, and `fork_turns: "none"` where supported. Do not use a full-history fork for overrides. Report incompatible controls rather than changing global configuration or bypassing them with a nested CLI. Use `followup_task` for same-rung continuations and a fresh spawn for model/effort changes. Wait/list/steering calls do not create free extra assignments. Interrupt overdue workers and ensure writes stop before continuing. Issue a batch as several `spawn_agent` calls, then `wait_agent` on each; the session's advertised slot count, which may include the parent, is the capacity signal, and a spawn refused for capacity is dispatched later without re-spawning running items.
Record requested and observable effective settings; use `unavailable` when effective values are not exposed. Never silently substitute unavailable models or settings. Keep evidence paths in briefs instead of copying transcripts. Retry briefs name the correction/hypothesis and say **continue the patch** or **replace these hunks**.

## Accounting and triage

Track total calls, calls per stage, and rung per stage/work item separately. Each new work assignment, retry, or continuation costs one call; status messages and waits cost none. Parallel workers and baseline-test workers count individually. When supported, create one runtime task-list entry per dispatched assignment or continuation; updating it costs no call. A correct Validate FAIL is successful validation, not a reason to escalate the validator. Diagnose the failure before choosing a row.

| Finding                                                      | Next action                                                                            | Counts as                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Inadequate work                                              | Escalate the responsible stage with evidence                                           | call + rung advance/jump                                       |
| PARTIAL with sound approach and progress                     | Continue at the same rung                                                              | call                                                           |
| Second PARTIAL at the same rung, or no progress evidence     | Escalate that stage                                                                    | call + rung advance/jump                                       |
| Wrong diagnosis                                              | Escalate Discover; revise implementation brief afterwards                              | call + rung advance/jump (Discover)                            |
| Validate FAIL is wrong                                       | Parent corrects with recorded evidence, or escalates Validate; do not change Implement | none for correction; call + rung advance/jump for revalidation |
| Validate FAIL correctly identifies inadequate implementation | Escalate Implement, then fresh Validate at its current rung                            | call + rung advance/jump (Implement), call (Validate)          |
| Validate times out with completed checks listed              | Continue at its current rung on outstanding checks                                     | call                                                           |
| Environment failure or missing prerequisite                  | Remedy within authorization, then retry once; stop if unresolved                       | call for retry; no rung change                                 |
| Blocking ambiguity changes "done" or tier D risk             | Ask the user; name the blocker                                                         | none                                                           |

Parent correction does not waive checks: acceptance requires evidence for every criterion. Continue validation in the same agent only if it never implemented and the patch is unchanged. After a repair, use a fresh validator. A correct FAIL at rung 5 does not exhaust the validator; triage the implementation.

**Budgets:** A 3 calls; B 4; C/D 8. Check before dispatch: remaining calls must cover all proposed workers plus one final Validate when their work requires it. Validate itself needs only its own call. Admission of a batch requires `remaining ≥ workers in this batch + Implement items outside this batch not yet dispatched + the final Validate set when required`; shrink width to fit, since serialising changes concurrency, not call count. Examples: tier B with three implementers, 3 + 0 + 1 = 4 of 4; tier C with two Discover shards and two planned items, 2 + 2 + 1 = 5 of 8; tier D with three shards, three items and two validators, 3 + 3 + 2 = 8 of 8. A full-width batch can leave no retry, as in the B and D examples; say so when choosing width. Reserve implementation and validation after discovery. Recheck after promotion.

The last allowed call may complete the task successfully. Otherwise stop before unaffordable work, at final-rung failure, or for unresolved blockers. Never silently omit required work or claim completion with required validation outstanding. Ordinary implementation choices need no user question; record them.

## Snapshots and handoffs

The parent alone runs the embedded Bash/Git snapshot script below. No companion file is needed. With `umask 077`, create `${TMPDIR:-/tmp}/escalating-subagents/`, then a unique `task.XXXXXX` directory there using `mktemp -d`. Extract the marked block with this command, never by retyping it (SKILL is this document's absolute path, TASK the task directory):

````text
sed -n '/^<!-- agent-snapshot:start -->$/,/^<!-- agent-snapshot:end -->$/p' SKILL | sed '1,/^```bash$/d;/^```$/,$d' > TASK/agent-snapshot.sh
````

Its SHA-256 (`shasum -a 256` or `sha256sum`) must be `ddc6cd474ae00cb7fc7613deefb4a9f5ff959f6b641abf041f1a7e26d7d8ca95`; a mismatch is a blocker. Use `<task>/state` separately for snapshots. Do not place the script inside the initially empty state directory. Run it with Bash, never source it.

Record absolute repository, helper, and state paths in the parent ledger; pass them explicitly on every invocation as literal absolute paths, never through shell variables or state carried across commands. Workers never run the helper or receive its control paths. Initialize successfully before any dispatch; report initialization errors and stop, identifying sandbox blockers only when permissions caused them. Uppercase words below are placeholders; quote actual paths:

```text
bash HELPER init REPO STATE
bash HELPER capture STATE base
bash HELPER capture STATE pre-1
bash HELPER capture STATE post-1
bash HELPER diff STATE pre-1 post-1 names0
bash HELPER diff STATE pre-1 post-1 stat
bash HELPER diff STATE base post-1 patch
```

Capture `base` once, `pre-N` immediately before each dispatch/batch, and `post-N` after all its workers and writes finish. Store integrated patch output in scratch evidence. Named snapshots are immutable. State persists tree IDs and temporary indexes/objects; the real index/object database is unchanged. Tracked ignored files and non-ignored untracked files are included. Do not use `git diff HEAD` as a substitute.

Helper failures are blockers. It rejects concurrent writes; do not delete a lock unless its recorded process is confirmed stopped. Interrupted unpublished captures cannot replace named snapshots. Keep state until reporting and any intended follow-up finish.

Use NUL-delimited changed paths for scope checks, `stat` for summaries, and the integrated patch for Validate. Out-of-scope edits are rejected unless the parent explicitly extends ownership for a legitimate dependency. Preserve unrelated work; never automatically reset, clean, stash, or revert it.

Implement runs in parallel by default. An item joins a batch only when all three hold: disjoint ownership (files or globs); dependencies satisfied (interfaces fixed in the brief, no item consumes another's unfinished output); no conflicting side effects (generated files, schema or migrations, databases, ports, caches, test fixtures, CI config). Otherwise serialise or merge. The default cap is 4 writers per batch; dispatch `min(cap, available slots)` in one message, and on a partial dispatch keep the spawned workers and dispatch the remainder when slots free, never re-spawning a running item. Every brief of a batch carries the parent's decisions list (names, interfaces, conventions chosen so far) and the batch snapshot name plus tree ID. For each batch, compare against the union of ownership; reports provide individual attribution, not proof of authorship. After the entire batch finishes, capture `post-N` and check its scope before dispatching the next batch or validating; read-only shards must leave `names0 pre-N post-N` empty. Serialize shared files/infrastructure and unrelated concurrent writers that would contaminate snapshots.

Verify command results, evidence paths, cited locations, and file-state relevance at handoffs. New edits invalidate affected checks. Accepted work advances; rejected work returns to triage. Track long-running commands to completion and stop outstanding writes before snapshotting; background launch is not completion.

## Repository constraints and briefs

Read applicable `AGENTS.md`, scoped instructions, specifications, and design guidance. Use the repository's package manager, locking, dependency-version, migration, and documentation policies. Carry production-data constraints explicitly into relevant worker briefs, including live-data and additive-only requirements where applicable; do not rely on workers discovering them indirectly.

Workers never commit, push, deploy, or perform unrelated external writes. The parent may perform explicitly requested actions only when repository and host rules permit them.

Every brief includes: task, tier, original request, absolute repository/instruction/evidence paths, model/effort, criteria verbatim, ownership, command timeouts, wall-clock budget, production-data constraints, and "do not delegate, invoke this skill, or run the snapshot helper."

- **Discover:** relevant paths, previous report if retrying; owns nothing except explicitly authorized repro/test files. No product edits or installs. Report outcome, cause/scope, locations, evidence, proposed criteria, open points, next step.
- **Implement:** Discover report when present and parent choices; exact owned files/globs and retry patch instructions. Report outcome, edits, commands/results, evidence, open points, correction, next step.
- **Validate:** integrated patch, specifications, and implementation evidence; no repository edits. Report outcome, evidence per criterion, regressions, untested areas, proposed tests, and completed/outstanding checks. Do not trust implementation claims without evidence.

Reports are at most 30 lines; reference longer evidence files.

## Progress and final report

Emit one concise update per dispatch, handoff, triage decision, promotion, and one-call-remaining warning. Combine information belonging to the same event; follow host progress requirements while waiting. Use this literal progress format:

```text
[tier {tier}] {stage/work-item} · rung {rung} ({model}/{effort}) · call {used}/{budget} · {mm:ss} → {outcome} ({evidence}); next: {action}
```

Example:

```text
[tier C] Implement · rung 3 (gpt-6.1-sol/low) · call 4/8 · 06:12 → accepted (3 files); next: Validate
```

Use this literal final-report template, replacing bracketed fields. Use `unavailable` for unexposed usage/effective settings and `not assessed` for post-acceptance defects until evidence exists. Report actual external actions, not merely authorization. Report measured elapsed time and observed concurrency; make no savings claim without a serial baseline.

```text
Tier: [A/B/C/D]
Ledger: [stage/work item | rung | requested → effective model/effort | call n/N | elapsed | outcome]
Parallelism: [batches | observed max concurrent | measured elapsed per batch]
Verified: [checks, results, and who verified]
Choices: [implementation decisions]
Unresolved checks/work: [details or none]
Working tree: [git status --porcelain]
External actions: [actual commits/pushes/deployments/other writes or none]
Usage: [parent + worker tokens/reported cost, or unavailable; label estimates]
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
