#!/usr/bin/env bash
# Persistent content snapshots for the escalating-agents skill. Bash 3.2+ and Git 2.31+.
# Run by the coordinator (normally through ledger.sh), never by workers.
set -euo pipefail
umask 077

die() { printf 'agent-snapshot: %s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'usage: agent-snapshot.sh init [--plain] <workspace> <state-dir>' \
    '       agent-snapshot.sh capture <state-dir> <name>' \
    '       agent-snapshot.sh diff <state-dir> <from> <to> <patch|stat|names0>' \
    '       agent-snapshot.sh checkpoint <state-dir> <from> <to> <patch-file|-> [owned-glob ...]' >&2
  exit 64
}

# A caller's alternate index/worktree must not redirect the repository being read.
unset GIT_DIR GIT_COMMON_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY
unset GIT_ALTERNATE_OBJECT_DIRECTORIES
export GIT_OPTIONAL_LOCKS=0
snapshot_locked=0
snapshot_work=''
snapshot_state=''
snapshot_mode=git
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
  snapshot_repo=$(git -C "$1" rev-parse --show-toplevel) || die 'not a Git working tree; use init --plain for a plain directory'
  snapshot_repo=$(cd "$snapshot_repo" && pwd -P)
  snapshot_gitdir=$(git -C "$snapshot_repo" rev-parse --absolute-git-dir)
  snapshot_gitdir=$(cd "$snapshot_gitdir" && pwd -P)
  snapshot_source_objects=$(git -C "$snapshot_repo" rev-parse --path-format=absolute --git-path objects)
  snapshot_source_objects=$(cd "$snapshot_source_objects" && pwd -P)
}

# A plain directory has no repository of its own: the state directory holds a private one.
plain_identity() {
  [[ -d "$1" ]] || die 'workspace directory does not exist'
  snapshot_repo=$(cd "$1" && pwd -P)
  snapshot_gitdir="$snapshot_state/plain/.git"
  snapshot_source_objects=''
}

check_outside_repo() {
  case "$snapshot_state/" in
    "$snapshot_repo/"*)
      die 'state directory must be outside the repository and Git storage' ;;
  esac
  [[ "$snapshot_mode" == git ]] || return 0
  case "$snapshot_state/" in
    "$snapshot_gitdir/"*|"$snapshot_source_objects/"*)
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
  snapshot_mode=$(git config --no-includes --file "$snapshot_state/meta" --get snapshot.mode || printf 'git\n')
  case "$snapshot_mode" in
    git)
      saved_gitdir=$(meta_get gitdir)
      saved_objects=$(meta_get sourceObjects)
      repo_identity "$saved_repo"
      [[ "$snapshot_repo" == "$saved_repo" && "$snapshot_gitdir" == "$saved_gitdir" && \
         "$snapshot_source_objects" == "$saved_objects" ]] || die 'repository identity mismatch'
      ;;
    plain)
      [[ -d "$saved_repo" ]] || die 'repository identity mismatch'
      plain_identity "$saved_repo"
      [[ "$snapshot_repo" == "$saved_repo" && -d "$snapshot_gitdir" && ! -L "$snapshot_gitdir" ]] || die 'repository identity mismatch'
      ;;
    *) die 'missing or corrupt state metadata' ;;
  esac
  check_outside_repo
  [[ -d "$snapshot_state/objects" && ! -L "$snapshot_state/objects" && \
     -d "$snapshot_state/trees" && ! -L "$snapshot_state/trees" ]] || die 'missing or corrupt state storage'
}

snapshot_git() {
  if [[ "$snapshot_mode" == plain ]]; then
    GIT_DIR="$snapshot_gitdir" GIT_WORK_TREE="$snapshot_repo" GIT_OBJECT_DIRECTORY="$snapshot_state/objects" \
      git -C "$snapshot_repo" -c core.fsmonitor=false -c core.untrackedCache=false \
        -c core.splitIndex=false -c core.sparseCheckout=false -c core.excludesFile=/dev/null \
        -c advice.addEmbeddedRepo=false "$@"
  else
    GIT_OBJECT_DIRECTORY="$snapshot_state/objects" \
    GIT_ALTERNATE_OBJECT_DIRECTORIES="$snapshot_source_objects" \
      git -C "$snapshot_repo" -c core.fsmonitor=false -c core.untrackedCache=false \
        -c core.splitIndex=false -c core.sparseCheckout=false "$@"
  fi
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

# Publish snapshot $1 from the working content. The caller holds the lock.
capture_tree() {
  [[ ! -e "$snapshot_state/trees/$1.tree" && ! -L "$snapshot_state/trees/$1.tree" ]] || die "snapshot already exists: $1"
  snapshot_work=$(mktemp -d "$snapshot_state/write.XXXXXX")
  if [[ "$snapshot_mode" == git ]]; then
    # Seed tracked entries, including ignored files and split-index entries, without
    # copying index extensions or writing into the real index/object database.
    git -C "$snapshot_repo" ls-files --stage -z > "$snapshot_work/entries"
    export GIT_INDEX_FILE="$snapshot_work/index"
    snapshot_git update-index -z --index-info < "$snapshot_work/entries"
  fi
  export GIT_INDEX_FILE="$snapshot_work/index"
  snapshot_git add -A
  snapshot_git write-tree > "$snapshot_work/tree"
  unset GIT_INDEX_FILE
  mv -- "$snapshot_work/tree" "$snapshot_state/trees/$1.tree"
  rm -rf -- "$snapshot_work"
  snapshot_work=''
}

# True when path $1 falls under owned glob $2. `*` also matches `/`; a directory owns its contents.
path_owned() {
  local glob=$2
  case "$glob" in */) glob="$glob*" ;; esac
  # shellcheck disable=SC2053
  [[ "$1" == $glob || "$1" == "$glob"/* ]]
}

[[ $# -gt 0 ]] || usage
snapshot_command=$1
shift
case "$snapshot_command" in
  init)
    if [[ "${1:-}" == --plain ]]; then
      snapshot_mode=plain
      shift
    fi
    [[ $# == 2 ]] || usage
    if [[ -d "$2" ]]; then
      snapshot_state=$(cd "$2" && pwd -P)
    else
      snapshot_parent=$(cd "$(dirname "$2")" && pwd -P) || die 'state parent directory does not exist'
      snapshot_state="$snapshot_parent/$(basename "$2")"
    fi
    if [[ "$snapshot_mode" == plain ]]; then plain_identity "$1"; else repo_identity "$1"; fi
    check_outside_repo
    mkdir -p -- "$snapshot_state"
    lock_state
    if [[ -f "$snapshot_state/meta" ]]; then
      snapshot_requested_repo=$snapshot_repo
      snapshot_requested_mode=$snapshot_mode
      load_state "$snapshot_state"
      [[ "$snapshot_repo" == "$snapshot_requested_repo" && "$snapshot_mode" == "$snapshot_requested_mode" ]] || die 'state belongs to a different repository'
    else
      shopt -s dotglob nullglob
      for snapshot_entry in "$snapshot_state"/*; do
        [[ "$snapshot_entry" == "$snapshot_state/.lock" ]] || die 'uninitialized state directory is not empty'
      done
      mkdir -- "$snapshot_state/objects" "$snapshot_state/trees"
      if [[ "$snapshot_mode" == plain ]]; then
        git init -q --template= "$snapshot_state/plain"
      fi
      snapshot_work=$(mktemp -d "$snapshot_state/write.XXXXXX")
      git config --file "$snapshot_work/meta" snapshot.version 1
      git config --file "$snapshot_work/meta" snapshot.mode "$snapshot_mode"
      git config --file "$snapshot_work/meta" snapshot.repo "$snapshot_repo"
      if [[ "$snapshot_mode" == git ]]; then
        git config --file "$snapshot_work/meta" snapshot.gitdir "$snapshot_gitdir"
        git config --file "$snapshot_work/meta" snapshot.sourceObjects "$snapshot_source_objects"
      fi
      mv -- "$snapshot_work/meta" "$snapshot_state/meta"
    fi
    printf '%s\n' "$snapshot_state"
    ;;
  capture)
    [[ $# == 2 ]] || usage
    load_state "$1"
    valid_name "$2"
    lock_state
    capture_tree "$2"
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
  checkpoint)
    # Capture <to> when it does not exist yet, check every path changed since <from> against the
    # owned globs, write the integrated patch (base..<to> when `base` exists), print one verdict line.
    [[ $# -ge 4 ]] || usage
    load_state "$1"
    valid_name "$2"
    valid_name "$3"
    snapshot_from_name=$2
    snapshot_to_name=$3
    snapshot_patch=$4
    shift 4
    lock_state
    if [[ ! -e "$snapshot_state/trees/$snapshot_to_name.tree" ]]; then capture_tree "$snapshot_to_name"; fi
    snapshot_from=$(read_tree "$snapshot_from_name")
    snapshot_to=$(read_tree "$snapshot_to_name")
    snapshot_work=$(mktemp -d "$snapshot_state/write.XXXXXX")
    snapshot_git diff --no-ext-diff --no-textconv --no-renames --no-color --name-only -z \
      "$snapshot_from" "$snapshot_to" > "$snapshot_work/names"
    snapshot_changed=0
    snapshot_outside=0
    : > "$snapshot_work/outside"
    while IFS= read -r -d '' snapshot_path; do
      snapshot_changed=$((snapshot_changed + 1))
      snapshot_owned=0
      for snapshot_glob in ${1+"$@"}; do
        if path_owned "$snapshot_path" "$snapshot_glob"; then snapshot_owned=1; break; fi
      done
      if [[ "$snapshot_owned" == 0 ]]; then
        snapshot_outside=$((snapshot_outside + 1))
        printf '%s' "$snapshot_path" | tr '\n\t' '??' >> "$snapshot_work/outside"
        printf '\n' >> "$snapshot_work/outside"
      fi
    done < "$snapshot_work/names"
    if [[ "$snapshot_patch" != - ]]; then
      snapshot_base=$snapshot_from
      if [[ -f "$snapshot_state/trees/base.tree" ]]; then snapshot_base=$(read_tree base); fi
      snapshot_git diff --no-ext-diff --no-textconv --no-renames --no-color --binary \
        "$snapshot_base" "$snapshot_to" > "$snapshot_patch"
    fi
    printf 'checkpoint %s tree=%s changed=%s out-of-scope=%s patch=%s\n' \
      "$snapshot_to_name" "$snapshot_to" "$snapshot_changed" "$snapshot_outside" "$snapshot_patch"
    if [[ "$snapshot_outside" != 0 ]]; then
      while IFS= read -r snapshot_path; do printf 'out-of-scope: %s\n' "$snapshot_path"; done < "$snapshot_work/outside"
      exit 3
    fi
    ;;
  *) usage ;;
esac
