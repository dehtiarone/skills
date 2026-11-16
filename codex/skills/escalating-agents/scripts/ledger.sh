#!/usr/bin/env bash
# Run ledger for the escalating-agents skill: budget admission, ladder steps, the model gate,
# evidence acceptance, progress lines, status and the final report. Bash 3.2+ and Git 2.31+.
# Run by the coordinator only, never by workers. Lines that start with a symbol are the user-facing
# progress log; lines that start with `next:`, `note:` or `dispatch` are for the coordinator.
set -euo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
SKILL_DIR=$(dirname "$SCRIPT_DIR")
HELPER="$SCRIPT_DIR/agent-snapshot.sh"

# The ladder. c = cheap model, x = expensive model. Every item starts at level 1.
LADDER_PRODUCE='c:low c:medium c:high x:high'
LADDER_SUPPORT='c:low c:medium c:high'
CHEAP_TOP=3
TYPES_RUN='behavioral static parse format reconciliation recompute schema'
TYPES_SAVED='command-output source'
TYPES_ALL="$TYPES_RUN $TYPES_SAVED inspection"
MUTATION_RE='(^|[;&|[:space:]/])(aws|gcloud|gsutil|bq|az|kubectl|helm|terraform|tofu|pulumi|doctl|oci|psql|mysql|mongosh|snowsql|curl)[[:space:]].*((^|[[:space:]"(]|'"'"')(create|delete|remove|rm|rb|mb|put|post|patch|update|modify|set|add|attach|detach|associate|disassociate|run|start|stop|terminate|reboot|apply|destroy|deploy|import|restore|revoke|grant|authorize|enable|disable|tag|untag|cp|mv|sync|insert|drop|truncate|alter|scale|rollout|exec|cordon|drain|taint)([-[:space:]]|$)|-X[[:space:]]*(POST|PUT|PATCH|DELETE)|--data)'

# A cloud or database CLI: in an infra run the script executes one only when the plan fixed the command.
EXTERNAL_RE='(^|[;&|[:space:]/])(aws|gcloud|gsutil|bq|az|kubectl|helm|terraform|tofu|pulumi|doctl|oci|psql|mysql|mongosh|snowsql)[[:space:]]'
CONSTANT_RE='^(echo|printf|true|false|:|exit|cd|export|yes|sleep)$'
SECRET_RE='(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{32,})'

die() { printf 'ledger: %s\n' "$*" >&2; exit 1; }

# ---- secrets: detected by variable name and by pattern; detection is not a guarantee ------------
SECRET_NAMES=''
for secret_name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | grep -Ei '(secret|token|password|passwd|credential|api_?key|access_?key|private_?key)' || true); do
  secret_value=${!secret_name:-}
  if [[ ${#secret_value} -ge 8 ]]; then SECRET_NAMES="$SECRET_NAMES $secret_name"; fi
done
unset secret_name secret_value
redact() { # stdin to stdout with every detected secret value withheld
  local line name
  while IFS= read -r line || [[ -n "$line" ]]; do
    for name in $SECRET_NAMES; do line=${line//"${!name}"/[withheld:$name]}; done
    printf '%s\n' "$line"
  done | sed -E "s#$SECRET_RE#[withheld]#g"
}
scrub() { printf '%s\n' "$1" | redact; }
has_secret() { # text → 0, and SECRET_HIT names what was found (never the value)
  local name
  for name in $SECRET_NAMES; do
    case "$1" in *"${!name}"*) SECRET_HIT="the value of \$$name"; return 0 ;; esac
  done
  if printf '%s\n' "$1" | grep -Eq -- "$SECRET_RE"; then SECRET_HIT='a key or token'; return 0; fi
  return 1
}
usage() {
  printf '%s\n' 'usage: ledger.sh init --host claude|codex --tier A|B|C|D --workspace DIR [--kind code|infra|data]' \
    '                      [--coordinator MODEL/EFFORT] [--plain] [--ascii] [--task-root DIR]' \
    '       ledger.sh plan TASK                       (plan lines on stdin)' \
    '       ledger.sh dispatch TASK [STAGE/SLUG ...] [--slots N] [--correction TEXT] [--narrow TEXT]' \
    '       ledger.sh result TASK STAGE/SLUG OUTCOME [--class C] [--sig TEXT] [--ran MODEL/EFFORT] [--worker ID] [--no-progress]' \
    '       ledger.sh reconcile TASK                  (after a compaction: record finished workers from their report files)' \
    '       ledger.sh gate TASK produce/SLUG [--narrowing-impossible TEXT]' \
    '       ledger.sh classify TASK produce/SLUG CLASS --by map/SLUG' \
    '       ledger.sh drift TASK accept TEXT' \
    '       ledger.sh answer TASK STAGE/SLUG TEXT | stop TASK STAGE/SLUG REASON | defer TASK STAGE/SLUG ...' \
    '       ledger.sh scope TASK extend GLOB | scope TASK reject | promote TASK TIER REASON' \
    '       ledger.sh pinning TASK mismatch TEXT | pinning TASK accept TEXT' \
    '       ledger.sh status TASK | report TASK [--external TEXT] [--usage TEXT] | numbers HOST' >&2
  exit 64
}

host_numbers() {
  case "$1" in
    claude)
      N_CHEAP=haiku; N_EXP=sonnet; N_TAKES_PRODUCE=8; N_TAKES_SUPPORT=4; N_CONT=1; N_GATE_MIN=4; WEIGHT=8
      case "$2" in A) N_BUDGET=14 ;; B) N_BUDGET=24 ;; C) N_BUDGET=30 ;; D) N_BUDGET=36 ;; *) die "unknown tier: $2" ;; esac ;;
    codex)
      N_CHEAP=gpt-6-luna; N_EXP=gpt-6.1-terra; N_TAKES_PRODUCE=12; N_TAKES_SUPPORT=6; N_CONT=2; N_GATE_MIN=5; WEIGHT=4
      case "$2" in A) N_BUDGET=21 ;; B) N_BUDGET=36 ;; C) N_BUDGET=50 ;; D) N_BUDGET=64 ;; *) die "unknown tier: $2" ;; esac ;;
    *) die "unknown host: $1 (claude or codex)" ;;
  esac
  case "$2" in A) N_V=0 ;; B|C) N_V=1 ;; D) N_V=2 ;; esac
}

# ---- state helpers ---------------------------------------------------------------------------
TASK=''
now() { date +%s; }
rget() { if [[ -f "$TASK/run/$1" ]]; then cat "$TASK/run/$1"; else printf '%s\n' "${2-}"; fi; }
rput() { printf '%s\n' "$2" > "$TASK/run/$1"; }
iget() { if [[ -f "$TASK/items/$1/$2" ]]; then cat "$TASK/items/$1/$2"; else printf '%s\n' "${3-}"; fi; }
iput() { printf '%s\n' "$3" > "$TASK/items/$1/$2"; }
trim() { local s=$1; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }
clean() { printf '%s' "$1" | tr '\t\n\r' '   ' | cut -c1-"${2:-80}"; }
in_list() { local x; for x in $2; do [[ "$x" == "$1" ]] && return 0; done; return 1; }
load_task() {
  [[ -n "${1:-}" && -d "$1/run" ]] || die "not a task directory: ${1:-<missing>} (run init first)"
  TASK=$(cd "$1" && pwd -P)
  HOST=$(rget host); TIER=$(rget tier); WORKSPACE=$(rget workspace)
  host_numbers "$HOST" "$TIER"
  BUDGET=$(rget budget)
}
iid() {
  case "$1" in */*) : ;; *) die "name items as stage/slug: $1" ;; esac
  local id="${1%%/*}.${1#*/}"
  [[ -d "$TASK/items/$id" ]] || die "unknown item: $1"
  printf '%s\n' "$id"
}
iname() { printf '%s/%s\n' "${1%%.*}" "${1#*.}"; }
istage() { printf '%s\n' "${1%%.*}"; }
islug() { printf '%s\n' "${1#*.}"; }
items() { if [[ -f "$TASK/order" ]]; then cat "$TASK/order"; fi; }
ladder() { if [[ "$(istage "$1")" == produce ]]; then printf '%s\n' "$LADDER_PRODUCE"; else printf '%s\n' "$LADDER_SUPPORT"; fi; }
levels() { local n=0 x; for x in $(ladder "$1"); do n=$((n + 1)); done; printf '%s\n' "$n"; }
take_limit() { if [[ "$(istage "$1")" == produce ]]; then printf '%s\n' "$N_TAKES_PRODUCE"; else printf '%s\n' "$N_TAKES_SUPPORT"; fi; }
# model/effort and unit cost of level $2 for item $1: sets ME_MODEL ME_EFFORT ME_UNITS
level_me() {
  local n=0 x
  for x in $(ladder "$1"); do
    n=$((n + 1))
    if [[ "$n" == "$2" ]]; then
      ME_EFFORT=${x#*:}
      if [[ "${x%%:*}" == x ]]; then ME_MODEL=$N_EXP; ME_UNITS=$WEIGHT; else ME_MODEL=$N_CHEAP; ME_UNITS=1; fi
      return 0
    fi
  done
  die "no level $2 on the ladder of $(iname "$1")"
}
effort_name() { if [[ "$HOST" == codex ]]; then printf reasoning_effort; else printf effort; fi; }
time_limit() { if [[ "$TIER" == A || "$TIER" == B ]]; then printf 10; else printf 25; fi; }
confirmed_text() {
  if [[ "$1" == check ]]; then printf 'reproducible failing check re-run by the script'
  elif [[ "$1" == validator ]]; then printf 'fresh validator FAIL with supported evidence'
  else printf "none (a worker's own claim is not enough)"; fi
}
narrowing_text() { # id
  if [[ "$(iget "$1" narrowed 0)" == 1 ]]; then printf 'tried once and failed (%s)' "$(iget "$1" narrow_text '')"
  elif [[ "$(iget "$1" narrowed 0)" == impossible ]]; then printf 'impossible: %s' "$(iget "$1" narrow_reason '')"
  else printf 'not tried'; fi
}
evidence_dir() { printf '%s/evidence/%s\n' "$TASK" "$(islug "$1")"; }

# ---- progress log ----------------------------------------------------------------------------
sym() {
  if [[ "$(rget symbols unicode)" == ascii ]]; then
    case "$1" in start) printf '> ' ;; ok) printf 'ok' ;; fail) printf 'x ' ;; effort) printf '^ ' ;; model) printf '^^' ;; block) printf '||' ;; end) printf '# ' ;; esac
  else
    case "$1" in start) printf '▶' ;; ok) printf '✓' ;; fail) printf '✗' ;; effort) printf '↑' ;; model) printf '⇧' ;; block) printf '⏸' ;; end) printf '■' ;; esac
  fi
}
sep() { if [[ "$(rget symbols unicode)" == ascii ]]; then printf ' - '; else printf ' · '; fi; }
arrow() { if [[ "$(rget symbols unicode)" == ascii ]]; then printf '%s' '->'; else printf '→'; fi; }
say() {
  local line
  line=$(printf '%s %-8s %s\n' "$(sym "$1")" "$2" "$3" | redact)
  printf '%s\n' "$line"
  printf '%s\n' "$line" >> "$TASK/log.txt"
}
event() { printf '%s\t%s\t%s\t%s\t%s\n' "$(now)" "$1" "$2" "$(rget used 0)/$BUDGET" "$3" | redact >> "$TASK/ledger.tsv"; }
elapsed() { local s=$1; [[ "$s" -ge 0 ]] || s=0; printf '%d:%02d' $((s / 60)) $((s % 60)); }
# "take k/T · level L/N · model/effort" for item $1 at its current take
where() {
  level_me "$1" "$(iget "$1" level 1)"
  printf 'take %s/%s%slevel %s/%s%s%s/%s' "$(iget "$1" takes 0)" "$(take_limit "$1")" "$(sep)" \
    "$(iget "$1" level 1)" "$(levels "$1")" "$(sep)" "$ME_MODEL" "$ME_EFFORT"
}
item_line() { say "$1" "$2" "$(printf '%-22s%s' "$(iname "$3")" "$4")"; }

# ---- snapshots -------------------------------------------------------------------------------
snap() { bash "$HELPER" "$@"; }

# ---- plan ------------------------------------------------------------------------------------
add_item() { # stage slug task owns criteria after locks
  local id="$1.$2" other
  [[ "$2" =~ ^[a-z0-9][a-z0-9-]{0,19}$ ]] || die "slug must be 1-20 chars of a-z, 0-9 and hyphen, named after the item's purpose: $2"
  if [[ "$1" != verify ]] && in_list "$2" 'checks review'; then die "slug '$2' is reserved for the validators; choose another"; fi
  for other in $(items); do
    if [[ "$(islug "$other")" == "$2" && "$other" != "$id" ]]; then die "slug already used by $(iname "$other"): $2"; fi
  done
  if [[ -d "$TASK/items/$id" ]]; then
    [[ "$(iget "$id" takes 0)" == 0 ]] || die "$(iname "$id") was already dispatched; add a new item instead of redefining it"
  else
    mkdir -p "$TASK/items/$id"
    printf '%s\n' "$id" >> "$TASK/order"
    iput "$id" level 1; iput "$id" takes 0; iput "$id" status ready
  fi
  iput "$id" task "$3"; iput "$id" owns "$4"; iput "$id" criteria "$5"; iput "$id" after "$6"; iput "$id" locks "${7:-}"
}
all_criteria() { local c out=''; for c in "$TASK"/criteria/*; do [[ -d "$c" ]] || continue; out="$out ${c##*/}"; done; printf '%s\n' "$out"; }
ensure_verify_items() {
  local list=''
  local c
  for c in $(all_criteria); do [[ "$c" == R1 ]] || list="$list,$c"; done
  list=${list#,}
  if [[ "$N_V" -ge 1 ]]; then
    if [[ ! -d "$TASK/items/verify.checks" ]]; then
      add_item verify checks 'Verify every criterion against the frozen snapshot with executed checks of your own choosing.' '' "$list" ''
    elif [[ "$(iget verify.checks takes 0)" == 0 ]]; then iput verify.checks criteria "$list"; fi
  fi
  if [[ "$N_V" -ge 2 && ! -d "$TASK/items/verify.review" ]]; then
    mkdir -p "$TASK/criteria/R1"
    printf 'inspection\n' > "$TASK/criteria/R1/type"
    printf 'The integrated patch does what was requested and nothing else: in scope, no regression, no secret, no unrequested external change.\n' > "$TASK/criteria/R1/text"
    add_item verify review 'Independent review: read the integrated patch line by line against the request, the decisions and the specifications.' '' 'R1' ''
  fi
}
plan_apply() {
  local line n=0 kw rest check expect text owns crit after locks field key stage slug type cid first_items planned=0
  first_items=$(items)
  while IFS= read -r line || [[ -n "$line" ]]; do
    n=$((n + 1))
    line=$(trim "$line")
    [[ -n "$line" && "$line" != '#'* ]] || continue
    if has_secret "$line"; then die "line $n holds $SECRET_HIT; name the variable instead of writing its value. Nothing was stored."; fi
    kw=${line%% *}; rest=$(trim "${line#"$kw"}")
    case "$kw" in
      criterion)
        check=''; expect=''
        if [[ "$rest" == *' | expect: '* ]]; then expect=$(trim "${rest##*' | expect: '}"); rest=${rest%' | expect: '*}; fi
        if [[ "$rest" == *' | check: '* ]]; then check=$(trim "${rest#*' | check: '}"); rest=${rest%%' | check: '*}; fi
        [[ "$rest" == *' | '* ]] || die "line $n: write: criterion ID TYPE | text [| check: command] [| expect: text the output must contain]"
        text=$(trim "${rest#*' | '}"); rest=${rest%%' | '*}
        cid=${rest%% *}; type=$(trim "${rest#"$cid"}")
        [[ "$cid" =~ ^[A-Z][A-Z0-9]{0,7}$ ]] || die "line $n: criterion ID must look like C1: $cid"
        in_list "$type" "$TYPES_ALL" || die "line $n: unknown evidence type '$type' (one of: $TYPES_ALL)"
        mkdir -p "$TASK/criteria/$cid"
        printf '%s\n' "$type" > "$TASK/criteria/$cid/type"
        printf '%s\n' "$text" > "$TASK/criteria/$cid/text"
        printf '%s\n' "$check" > "$TASK/criteria/$cid/check"
        printf '%s\n' "$expect" > "$TASK/criteria/$cid/expect"
        ;;
      item)
        stage=${rest%% *}; rest=$(trim "${rest#"$stage"}")
        slug=${rest%% *}; rest=$(trim "${rest#"$slug"}")
        in_list "$stage" 'map produce' || die "line $n: stage must be map or produce (verify items are created for you): $stage"
        text=''; owns=''; crit=''; after=''; locks=''
        rest=${rest#'| '}
        while [[ -n "$rest" ]]; do
          if [[ "$rest" == *' | '* ]]; then field=$(trim "${rest%%' | '*}"); rest=${rest#*' | '}; else field=$(trim "$rest"); rest=''; fi
          key=${field%%:*}
          case "$key" in
            owns) owns=$(printf '%s' "${field#owns:}" | tr -d ' ') ;;
            criteria) crit=$(printf '%s' "${field#criteria:}" | tr -d ' ') ;;
            after) after=$(printf '%s' "${field#after:}" | tr -d ' ') ;;
            locks) locks=$(printf '%s' "${field#locks:}" | tr -d ' ') ;;
            *) text=$field ;;
          esac
        done
        [[ -n "$text" ]] || die "line $n: item needs a task text"
        if [[ "$stage" == produce ]]; then
          [[ -n "$owns" && -n "$crit" ]] || die "line $n: every produce item names its owned outputs and at least one criterion (owns: …, criteria: …)"
          for cid in $(printf '%s' "$crit" | tr ',' ' '); do
            [[ -d "$TASK/criteria/$cid" ]] || die "line $n: unknown criterion $cid (define criteria before items)"
          done
        fi
        add_item "$stage" "$slug" "$text" "$owns" "$crit" "$after" "$locks"
        planned=$((planned + 1))
        if [[ "$stage" == produce ]]; then
          set -- $(printf '%s' "$crit" | tr ',' ' ')
          if [[ $# -gt 2 ]]; then printf 'note: %s/%s covers %s criteria; one behaviour per item — split it when the parts can be checked separately\n' "$stage" "$slug" "$#"; fi
        fi
        ;;
      request) printf '%s\n' "$rest" >> "$TASK/request.md" ;;
      decision) printf -- '- %s\n' "$rest" >> "$TASK/decisions.md" ;;
      allow) printf -- '- %s\n' "$rest" >> "$TASK/allowed-external.md" ;;
      limit)
        [[ "$rest" =~ ^[1-9][0-9]*$ ]] || die "line $n: limit takes a positive number of parallel workers"
        rput limit "$rest" ;;
      writers)
        [[ "$rest" =~ ^[1-9][0-9]*$ ]] || die "line $n: writers takes a positive number of parallel produce workers"
        rput writers "$rest" ;;
      *) die "line $n: unknown plan keyword '$kw' (request, criterion, item, decision, allow, limit, writers)" ;;
    esac
  done
  # The script executes a named check itself, so one that may change an external system needs the user's allow line.
  for cid in $(all_criteria); do
    check=$(cat "$TASK/criteria/$cid/check" 2>/dev/null || true)
    [[ -n "$check" ]] || continue
    if printf '%s\n' "$check" | grep -Eiq -- "$MUTATION_RE" && ! allowed_external "$check"; then
      die "criterion $cid: its check may change an external system and the script would run it. Use a read-only check, or add an 'allow' line with the exact command if the user authorised it"
    fi
  done
  if [[ "$TIER" == A ]]; then
    # Tier A has no validator, so the check must be fixed in the plan, not chosen by the producer.
    local owned
    for owned in $(items); do
      [[ "$(istage "$owned")" == produce ]] || continue
      for cid in $(printf '%s' "$(iget "$owned" criteria '')" | tr ',' ' '); do
        [[ -n "$(cat "$TASK/criteria/$cid/check" 2>/dev/null || true)" ]] || die "tier A accepts on the plan's own check: give criterion $cid a 'check:' command, or use tier B"
      done
    done
  fi
  ensure_verify_items
  if [[ -z "$(rget run_line '')" && -n "$(items)" ]]; then
    local count=0 id pin=''
    for id in $(items); do [[ "$(istage "$id")" == verify ]] || count=$((count + 1)); done
    case "$(rget pinning unverified)" in mismatch*) pin="$(sep)pinning: known mismatch ($(rget pinning_cause))" ;; esac
    say start run "tier $TIER$(sep)$count items$(sep)budget $BUDGET units$(sep)coordinator $(rget coordinator unknown)$pin"
    rput run_line 1
    event run - "tier $TIER kind $(rget kind) items $count"
  elif [[ "$planned" -gt 0 && -n "$first_items" ]]; then
    printf 'note: %s item(s) added\n' "$planned"
  fi
}
cmd_plan() {
  load_task "${1:-}"
  local backup f saved
  backup=$(mktemp -d "$TASK/plan.XXXXXX")
  cp -R "$TASK/criteria" "$TASK/items" "$backup/"
  for f in order decisions.md request.md allowed-external.md run/limit run/writers run/run_line log.txt; do
    if [[ -f "$TASK/$f" ]]; then cp "$TASK/$f" "$backup/$(printf '%s' "$f" | tr '/' '_')"; fi
  done
  if ( plan_apply ); then rm -rf "$backup"; next_hint; return 0; fi
  # A plan is applied whole or not at all, so a corrected plan can simply be sent again.
  rm -rf "$TASK/criteria" "$TASK/items"
  mv "$backup/criteria" "$backup/items" "$TASK/"
  for f in order decisions.md request.md allowed-external.md run/limit run/writers run/run_line log.txt; do
    saved="$backup/$(printf '%s' "$f" | tr '/' '_')"
    if [[ -f "$saved" ]]; then cp "$saved" "$TASK/$f"; else rm -f "$TASK/$f"; fi
  done
  rm -rf "$backup"
  printf 'ledger: nothing from this plan was applied; correct the line and send the whole plan again\n' >&2
  exit 1
}

# ---- briefs ----------------------------------------------------------------------------------
write_brief() { # id → path in BRIEF
  local id=$1 stage slug take tmpl kind ev c prev crit name
  stage=$(istage "$id"); slug=$(islug "$id"); take=$(iget "$id" takes); kind=$(rget kind code)
  ev=$(evidence_dir "$id")
  mkdir -p "$ev" "$TASK/briefs"
  BRIEF="$TASK/briefs/$stage.$slug.take-$take.md"
  tmpl="$stage"
  if [[ "$stage" == produce && "$take" -gt 1 ]]; then tmpl=repair; fi
  if [[ "$(iget "$id" level)" -gt "$CHEAP_TOP" ]]; then tmpl=escalated; fi
  [[ -f "$SKILL_DIR/references/briefs/$tmpl.md" ]] || die "missing brief template: references/briefs/$tmpl.md"
  level_me "$id" "$(iget "$id" level)"
  name=$(printf '%s' "$stage" | cut -c1 | tr '[:lower:]' '[:upper:]')$(printf '%s' "$stage" | cut -c2-)
  {
    cat "$SKILL_DIR/references/briefs/$tmpl.md"
    if [[ -f "$SKILL_DIR/references/briefs/kind-$kind.md" ]]; then printf '\n'; cat "$SKILL_DIR/references/briefs/kind-$kind.md"; fi
    printf '\n## Run\n\n'
    printf 'Workspace: %s\nTier: %s\nKind: %s\nBatch snapshot: %s\nTime limit: %s minutes\n' \
      "$WORKSPACE" "$TIER" "$kind" "$(rget cur_pre -)" "$(time_limit)"
    if [[ -f "$TASK/request.md" ]]; then printf 'Original request: %s\n' "$TASK/request.md"; fi
    if [[ -f "$TASK/allowed-external.md" ]]; then printf '\nExternal changes the user authorised (nothing else):\n'; cat "$TASK/allowed-external.md"; fi
    printf '\nDecisions (binding for every worker):\n'
    if [[ -f "$TASK/decisions.md" ]]; then cat "$TASK/decisions.md"; else printf -- '- none yet\n'; fi
    printf '\nCriteria of this run (ID | evidence type | text | named check):\n'
    for c in $(all_criteria); do
      printf -- '- %s | %s | %s | %s\n' "$c" "$(cat "$TASK/criteria/$c/type")" "$(cat "$TASK/criteria/$c/text")" "$(cat "$TASK/criteria/$c/check" 2>/dev/null || true)"
    done
    printf '\n## Your item\n\n'
    printf 'Stage: %s | Item: %s | Take: %s | Level: %s\n' "$name" "$slug" "$take" "$(iget "$id" level)"
    printf 'Requested model/effort: %s/%s\n' "$ME_MODEL" "$ME_EFFORT"
    printf 'Task: %s\n' "$(iget "$id" task)"
    if [[ "$tmpl" == escalated ]]; then printf 'Escalation record (why earlier takes failed): %s/escalation.md\n' "$ev"
    elif [[ -n "$(iget "$id" narrow_text '')" ]]; then printf 'Narrowed scope (do only this): %s\n' "$(iget "$id" narrow_text)"; fi
    if [[ "$stage" == produce ]]; then
      printf 'Owned outputs (write nowhere else in the workspace): %s\n' "$(iget "$id" owns)"
      if [[ -n "$(iget "$id" cleanup '')" ]]; then printf 'Cleanup (revert these only if you changed them; they are outside every ownership): %s\n' "$(iget "$id" cleanup)"; fi
    else
      printf 'Owned outputs: none; leave the workspace unchanged\n'
    fi
    crit=$(iget "$id" criteria '')
    if [[ -n "$crit" ]]; then printf 'Your criteria: %s\n' "$crit"; fi
    if [[ "$stage" == verify ]]; then
      printf 'Frozen snapshot: %s\nIntegrated patch: %s\nProducer evidence: %s/evidence/<item>/\n' \
        "$(rget frozen -)" "$(rget frozen_patch -)" "$TASK"
    fi
    if [[ "$take" -gt 1 ]]; then
      prev=$((take - 1))
      printf 'Correction: %s\n' "$(iget "$id" "corr.$take" '')"
      printf 'Prior records (read first): %s/take-%s.report.md %s/take-%s.checks.md %s/take-%s.verdict\n' "$ev" "$prev" "$ev" "$prev" "$ev" "$prev"
    fi
    printf 'Write your report to: %s/take-%s.report.md\n' "$ev" "$take"
    if [[ "$stage" != map ]]; then printf 'Write your check record to: %s/take-%s.checks.md\n' "$ev" "$take"; fi
    printf 'Save command output and other evidence under: %s/\n' "$ev"
  } | redact > "$BRIEF"
}

# ---- admission and dispatch ------------------------------------------------------------------
verify_pending() { # 1 when a verification cycle still has to run after the current work
  [[ "$N_V" -ge 1 && -z "$(rget validated '')" ]]
}
glob_parts() { # glob → GP_WILD, the literal text before its first wildcard and after its last
  case "$1" in
    *[\*\?\[]*) GP_WILD=1; GP_PRE=${1%%[\*\?\[]*}; GP_SUF=${1##*[\*\?\]]} ;;
    *) GP_WILD=0; GP_PRE=$1; GP_SUF='' ;;
  esac
}
# Two owned globs meet unless they provably share no path. A path matched by both starts with both
# literal prefixes and ends with both literal suffixes; anything not ruled out that way is treated
# as shared, so an uncertain pair runs one after the other instead of side by side.
globs_meet() {
  local a=${1%/} b=${2%/} ap as aw
  # shellcheck disable=SC2053
  if [[ "$a" == $b || "$b" == $a || "$a" == $b/* || "$b" == $a/* || "$a" == "$b"/* || "$b" == "$a"/* ]]; then return 0; fi
  glob_parts "$a"; ap=$GP_PRE; as=$GP_SUF; aw=$GP_WILD
  glob_parts "$b"
  if [[ "$aw" == 0 && "$GP_WILD" == 0 ]]; then return 1; fi
  if [[ "$aw" == 0 ]]; then [[ "$GP_PRE" == "$a"/* ]]; return; fi
  if [[ "$GP_WILD" == 0 ]]; then [[ "$ap" == "$b"/* ]]; return; fi
  [[ "$ap" == "$GP_PRE"* || "$GP_PRE" == "$ap"* ]] || return 1
  if [[ -n "$as" && -n "$GP_SUF" && "$as" != */* && "$GP_SUF" != */* ]]; then
    [[ "$as" == *"$GP_SUF" || "$GP_SUF" == *"$as" ]] || return 1
  fi
  return 0
}
overlaps() { # glob list a, glob list b (comma separated)
  local a b
  set -f
  for a in $(printf '%s' "$1" | tr ',' ' '); do
    for b in $(printf '%s' "$2" | tr ',' ' '); do
      if globs_meet "$a" "$b"; then set +f; return 0; fi
    done
  done
  set +f
  return 1
}
shares_lock() { # id a, id b: both name the same shared resource (a database, a port, a cache)
  local a b
  for a in $(printf '%s' "$(iget "$1" locks '')" | tr ',' ' '); do
    for b in $(printf '%s' "$(iget "$2" locks '')" | tr ',' ' '); do [[ "$a" == "$b" ]] && return 0; done
  done
  return 1
}
# Batch width cap: the smallest of the host's capacity, the user's or service's limit and the throttle backoff.
width_cap() {
  local w=0 v
  for v in "$(rget slots 0)" "$(rget limit 0)" "$(rget throttle 0)"; do
    if [[ "$v" != 0 ]]; then
      if [[ "$w" == 0 || "$v" -lt "$w" ]]; then w=$v; fi
    fi
  done
  printf '%s\n' "$w"
}
deps_done() {
  local d dep
  for d in $(printf '%s' "$(iget "$1" after '')" | tr ',' ' '); do
    dep=''
    for dep in $(items); do [[ "$(islug "$dep")" == "$d" ]] && break; dep=''; done
    [[ -n "$dep" ]] || die "$(iname "$1") waits for an unknown item: $d"
    case "$(iget "$dep" status)" in done|accepted) : ;; *) return 1 ;; esac
  done
  return 0
}
produced_any() { # 0 when at least one produce item awaits verification
  local id
  for id in $(items); do [[ "$(istage "$id")" == produce && "$(iget "$id" status)" == done ]] && return 0; done
  return 1
}
verify_dead() { # 0 when a validator the tier requires was stopped: verification cannot complete
  local id
  for id in $(items); do [[ "$(istage "$id")" == verify && "$(iget "$id" status)" == unresolved ]] && return 0; done
  return 1
}
verify_stale() { # 0 when the last validation failed and the workspace has not been changed since
  [[ -n "$(rget failed_frozen '')" && "$(rget frozen '')" == "$(rget failed_frozen '')" ]]
}
# Units the run still owes besides the batch being admitted: first takes of other items, validation, the reserve.
owed_units() { # id being admitted
  local other n=0 vp=0 reserve=0
  for other in $(items); do
    [[ "$(istage "$other")" == verify || "$other" == "$1" ]] && continue
    [[ "$(iget "$other" takes 0)" == 0 && "$(iget "$other" status)" != unresolved ]] && n=$((n + 1))
  done
  if verify_pending; then vp=$N_V; fi
  if [[ "$(rget cycle 0)" == 0 ]]; then reserve=$((1 + N_V)); fi
  printf '%s\n' $((n + vp + reserve))
}
produce_open() { # count of map/produce items that are not finished
  local id n=0
  for id in $(items); do
    [[ "$(istage "$id")" == verify ]] && continue
    case "$(iget "$id" status)" in done|accepted|unresolved) : ;; *) n=$((n + 1)) ;; esac
  done
  printf '%s\n' "$n"
}
cmd_dispatch() {
  load_task "${1:-}"; shift
  local explicit='' slots='' correction='' narrow='' id st stage
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --slots) slots=${2:-}; shift 2 ;;
      --correction) correction=${2:-}; shift 2 ;;
      --narrow) narrow=${2:-}; shift 2 ;;
      -*) die "unknown option: $1" ;;
      *) explicit="$explicit $(iid "$1")"; shift ;;
    esac
  done
  [[ -z "$(rget batch_open '')" ]] || die "batch $(rget batch) is still open; record every result first (ledger.sh status shows who is running)"
  [[ -z "$(rget scope_block '')" ]] || die 'out-of-scope changes are unresolved; run: ledger.sh scope TASK extend GLOB, or: ledger.sh scope TASK reject'
  [[ -z "$(rget drift_block '')" ]] || die "files changed outside any dispatch: $(rget drift_block). $(drift_help)"
  [[ "$(rget pinning unverified)" != mismatch ]] || die "pinning: known mismatch ($(rget pinning_cause)). $(pinning_help)"
  [[ -z "$slots" ]] || { [[ "$slots" =~ ^[1-9][0-9]*$ ]] || die '--slots takes a positive number'; rput slots "$slots"; }
  slots=$(width_cap)
  correction=$(scrub "$correction"); narrow=$(scrub "$narrow")
  if [[ -n "$narrow" ]]; then
    set -- $explicit
    [[ $# == 1 && "$(iget "$1" status)" == need-narrow ]] || die '--narrow applies to exactly one item that is waiting for a narrowed scope'
    iput "$1" narrow_text "$narrow"; iput "$1" narrowed 1; iput "$1" status retry
    iput "$1" sig_before_narrow "$(iget "$1" sig '')"
  fi
  if [[ -n "$correction" ]]; then
    # A corrected take at the cheap model's top effort is how gate condition 1 gets met.
    set -- $explicit
    [[ $# == 1 ]] || die '--correction applies to exactly one item'
    [[ "$(iget "$1" status)" != need-gate ]] || iput "$1" status retry
  fi
  # Candidates: explicit items, or every dispatchable map/produce item; validators only once production is frozen.
  local cand='' pool
  pool=$explicit
  [[ -n "$pool" ]] || pool=$(items)
  local open; open=$(produce_open)
  for id in $pool; do
    st=$(iget "$id" status); stage=$(istage "$id")
    case "$st" in ready|retry) : ;; *)
      [[ -z "$explicit" ]] || die "$(iname "$id") cannot be dispatched now (status: $st)"
      continue ;;
    esac
    if [[ "$stage" == verify ]]; then
      [[ "$open" == 0 ]] || { [[ -z "$explicit" ]] || die 'validators start only after every map and produce item is finished and frozen'; continue; }
      produced_any || continue
      if verify_dead; then printf 'note: %s is not dispatched: another validator was stopped, so verification cannot complete\n' "$(iname "$id")"; continue; fi
      if verify_stale; then printf 'note: %s is not dispatched: nothing changed since the last validation FAIL\n' "$(iname "$id")"; continue; fi
    else
      deps_done "$id" || continue
    fi
    if [[ "$(iget "$id" takes 0)" -ge "$(take_limit "$id")" ]]; then stop_item "$id" 'take limit reached'; continue; fi
    if [[ "$(iget "$id" level)" -gt "$CHEAP_TOP" && "$(iget "$id" exp_used 0)" == 1 ]]; then stop_item "$id" 'the one expensive take was already used'; continue; fi
    cand="$cand $id"
  done
  # Validators never share a batch with writers or map shards.
  local has_verify=0 has_other=0
  for id in $cand; do if [[ "$(istage "$id")" == verify ]]; then has_verify=1; else has_other=1; fi; done
  if [[ "$has_verify" == 1 && "$has_other" == 1 ]]; then
    local keep=''
    for id in $cand; do [[ "$(istage "$id")" == verify ]] || keep="$keep $id"; done
    cand=$keep; has_verify=0
  fi
  if [[ -z "$(trim "$cand")" ]]; then printf 'note: nothing to dispatch\n'; next_hint; return 0; fi

  # Eligibility (disjoint ownership), host slots, then budget admission.
  local used never=0 reserve=0 vp=0 cost=0 admitted='' count=0 writers=0 other refused=0
  used=$(rget used 0)
  for id in $(items); do
    [[ "$(istage "$id")" == verify ]] && continue
    [[ "$(iget "$id" takes 0)" == 0 && "$(iget "$id" status)" != unresolved ]] && never=$((never + 1))
  done
  if [[ "$has_verify" == 0 ]]; then
    if verify_pending; then vp=$N_V; fi
    if [[ "$(rget cycle 0)" == 0 ]]; then reserve=$((1 + N_V)); fi
  fi
  for id in $cand; do
    if [[ "$slots" != 0 && "$count" -ge "$slots" ]]; then printf 'note: %s waits for a free slot (%s at a time)\n' "$(iname "$id")" "$slots"; continue; fi
    other=''
    for other in $admitted; do
      if shares_lock "$id" "$other"; then break; fi
      other=''
    done
    if [[ -n "$other" ]]; then printf 'note: %s waits: it shares a lock with %s\n' "$(iname "$id")" "$(iname "$other")"; continue; fi
    if [[ "$(istage "$id")" == produce ]]; then
      if [[ "$(rget writers 0)" != 0 && "$writers" -ge "$(rget writers 0)" ]]; then printf 'note: %s waits: the plan allows %s writers per batch\n' "$(iname "$id")" "$(rget writers 0)"; continue; fi
      other=''
      for other in $admitted; do
        if [[ "$(istage "$other")" == produce ]] && overlaps "$(iget "$id" owns),$(iget "$id" cleanup '')" "$(iget "$other" owns),$(iget "$other" cleanup '')"; then break; fi
        other=''
      done
      if [[ -n "$other" ]]; then printf 'note: %s waits: its owned outputs may overlap %s\n' "$(iname "$id")" "$(iname "$other")"; continue; fi
    fi
    level_me "$id" "$(iget "$id" level)"
    local firsts=$never
    [[ "$(iget "$id" takes 0)" == 0 && "$(istage "$id")" != verify ]] && firsts=$((never - 1))
    if [[ $((used + cost + ME_UNITS + firsts + vp + reserve)) -gt "$BUDGET" ]]; then
      if [[ "$(iget "$id" takes 0)" == 0 && "$has_verify" == 0 ]]; then
        refused=$((refused + 1))
        printf 'note: %s is not admitted: budget %s, used %s, this batch %s, still owed %s. Merge items or stop one (ledger.sh stop).\n' \
          "$(iname "$id")" "$BUDGET" "$used" "$((cost + ME_UNITS))" "$((firsts + vp + reserve))"
      else
        iput "$id" status unresolved; iput "$id" stop_reason 'budget does not admit another take'
        item_line end stopped "$id" "$(where "$id")$(sep)budget does not admit another take"
        event stopped "$(iname "$id")" 'budget'
      fi
      continue
    fi
    [[ "$(iget "$id" takes 0)" == 0 && "$(istage "$id")" != verify ]] && never=$((never - 1))
    cost=$((cost + ME_UNITS)); admitted="$admitted $id"; count=$((count + 1))
    [[ "$(istage "$id")" != produce ]] || writers=$((writers + 1))
  done
  if [[ "$count" == 0 ]]; then
    if [[ "$refused" -gt 0 && "$used" == "$(rget used 0)" ]]; then
      printf 'next: no planned item fits what is left of the budget. Stop the items that are no longer needed (ledger.sh stop), promote the tier if the risk warrants it (ledger.sh promote), or end with ledger.sh report TASK\n'
      return 0
    fi
    next_hint; return 0
  fi

  # Open the batch: snapshot first, then count the calls and write the briefs. The workspace must still
  # be what the last batch left: a change nobody dispatched is never validated silently.
  local batch pre tree prev_post gap t take label running=0 out rc=0
  batch=$(( $(rget batch 0) + 1 ))
  rput snapn $(( $(rget snapn 0) + 1 )); pre="pre-$(rget snapn)"
  prev_post=$(rget last_post '')
  if [[ -n "$prev_post" ]]; then
    out=$(snap checkpoint "$TASK/state" "$prev_post" "$pre" -) || rc=$?
    [[ "$rc" == 0 || "$rc" == 3 ]] || die "snapshot checkpoint failed: $out"
    if [[ "$rc" == 3 ]]; then
      gap=$(printf '%s\n' "$out" | sed -n 's/^out-of-scope: //p' | tr '\n' ' ')
      rput drift_block "$(trim "$gap")"; rput drift_snap "$pre"
      say fail failed "$(printf '%-22s%s' workspace "changed outside any dispatch: $(clean "$gap" 120)")"
      event drift - "$gap"
      printf 'next: nothing was dispatched. %s\n' "$(drift_help)"
      return 0
    fi
    tree=$(cat "$TASK/state/trees/$pre.tree")
  else
    tree=$(snap capture "$TASK/state" "$pre")
  fi
  rput batch "$batch"; rput batch_open 1; rput cur_pre "$pre (tree $tree)"
  mkdir -p "$TASK/batches/$batch"
  printf '%s\n' "$pre" > "$TASK/batches/$batch/pre"
  t=$(now)
  printf '%s\n' "$t" > "$TASK/batches/$batch/start"
  printf '%s\n' "$admitted" > "$TASK/batches/$batch/items"
  rput used $((used + cost))
  label=''
  for id in $admitted; do
    stage=$(istage "$id")
    case " $label " in *" $stage "*) : ;; *) label="$label $stage" ;; esac
    take=$(( $(iget "$id" takes 0) + 1 ))
    iput "$id" takes "$take"; iput "$id" status running; iput "$id" started "$t"; iput "$id" batch "$batch"
    if [[ "$(iget "$id" level)" -gt "$CHEAP_TOP" ]]; then iput "$id" exp_used 1; fi
    if [[ "$take" -gt 1 ]]; then
      if [[ -n "$correction" && "$count" == 1 ]]; then iput "$id" "corr.$take" "$correction"
      elif [[ "$(iget "$id" last_outcome '')" == SUPPORTED ]]; then iput "$id" "corr.$take" 'Fresh validation of a changed workspace. Earlier records are for reference only; re-establish every criterion yourself.'
      else iput "$id" "corr.$take" "Take $((take - 1)) ended $(iget "$id" last_outcome FAIL): $(iget "$id" sig 'no usable result'). Read the prior records and do not repeat that approach."; fi
    fi
    write_brief "$id"
    iput "$id" brief "$BRIEF"
  done
  for id in $(items); do [[ "$(iget "$id" status)" == running ]] && running=$((running + 1)); done
  [[ "$running" -le "$(rget peak 0)" ]] || rput peak "$running"
  label=$(trim "$label"); label=${label// /+}
  if [[ "$count" -gt 1 ]]; then
    say start "batch $batch" "$label$(sep)$count subagents$(sep)units $((used + cost))/$BUDGET"
  fi
  for id in $admitted; do
    item_line start started "$id" "$(where "$id")"
    event started "$(iname "$id")" "$(where "$id")"
  done
  for id in $admitted; do
    stage=$(istage "$id"); level_me "$id" "$(iget "$id" level)"
    name=$(printf '%s' "$stage" | cut -c1 | tr '[:lower:]' '[:upper:]')$(printf '%s' "$stage" | cut -c2-)
    printf 'dispatch %s | model=%s | %s=%s | barrier=%s | continue=%s\n' "$(iname "$id")" "$ME_MODEL" "$(effort_name)" "$ME_EFFORT" \
      "$(if [[ "$stage" == verify ]]; then printf yes; else printf no; fi)" "$(if [[ "$(iget "$id" continue 0)" == 1 ]]; then printf same-worker; else printf no; fi)"
    printf '  Read the brief file named below completely, then do exactly what it says. Reply in at most 10 lines.\n'
    printf '  Stage: %s | Item: %s | Take: %s | Level: %s | Brief: %s\n' "$name" "$(islug "$id")" "$(iget "$id" takes)" "$(iget "$id" level)" "$(iget "$id" brief)"
    if [[ "$(iget "$id" continue 0)" == 1 && -n "$(iget "$id" worker '')" ]]; then printf 'note: %s continues in worker %s; if that worker is gone, start a new one with the same two lines\n' "$(iname "$id")" "$(iget "$id" worker)"; fi
    iput "$id" continue 0
  done
  printf 'next: start every worker above at once, each with exactly the printed model and %s and the two indented lines as its whole instruction; barrier=yes means nothing else starts until all of them have returned; then record each return with ledger.sh result\n' "$(effort_name)"
}
cmd_defer() { # the host refused these spawns for capacity: undo the dispatch and learn the width
  load_task "${1:-}"; shift
  local id started=0 other
  [[ -n "$(rget batch_open '')" ]] || die 'no open batch'
  for id in "$@"; do
    id=$(iid "$id")
    [[ "$(iget "$id" status)" == running ]] || die "$(iname "$id") is not running"
    level_me "$id" "$(iget "$id" level)"
    rput used $(( $(rget used) - ME_UNITS ))
    iput "$id" takes $(( $(iget "$id" takes) - 1 )); iput "$id" exp_used 0
    if [[ "$(iget "$id" takes)" == 0 ]]; then iput "$id" status ready; else iput "$id" status retry; fi
    iput "$id" batch ''
  done
  local batch keep=''
  batch=$(rget batch)
  for other in $(cat "$TASK/batches/$batch/items"); do
    if [[ "$(iget "$other" batch '')" == "$batch" ]]; then keep="$keep $other"; started=$((started + 1)); fi
  done
  printf '%s\n' "$keep" > "$TASK/batches/$batch/items"
  [[ "$started" -ge 1 ]] || { started=1; rput batch_open ''; }
  rput slots "$started"
  printf 'note: host capacity is %s parallel workers; deferred items go out with the next dispatch\n' "$started"
}

# ---- evidence acceptance ---------------------------------------------------------------------
run_check() { # command outfile timeout → RUN_EXIT. Every command the script executes is logged.
  local pid i
  printf '%s\t%s\n' "$(now)" "$1" >> "$TASK/commands.log"
  RAN_CHECKS=1
  ( cd "$WORKSPACE" && exec bash -c "$1" ) > "$2" 2>&1 < /dev/null &
  pid=$!
  ( i=0; while [[ "$i" -lt "$3" ]]; do sleep 1; i=$((i + 1)); kill -0 "$pid" 2>/dev/null || exit 0; done; kill -TERM "$pid" 2>/dev/null ) &
  if wait "$pid"; then RUN_EXIT=0; else RUN_EXIT=$?; fi
}
outsig() { printf '#%s' "$(cksum < "$1" | cut -d' ' -f1 | tail -c 5)"; }
strip_ticks() { local v=$1; if [[ "$v" == '`'*'`' && ${#v} -ge 2 ]]; then v=${v#\`}; v=${v%\`}; fi; printf '%s' "$v"; }
allowed_external() { [[ -f "$TASK/allowed-external.md" ]] && grep -qF -- "$1" "$TASK/allowed-external.md"; }
# The script is about to execute a command a worker wrote. GUARD names why it must not run, if so.
# This is a screen, not a sandbox: it refuses what it recognises and cannot prove a command harmless.
guard_command() { # command, criterion (or ''), who recorded it
  local named=''
  GUARD=''
  [[ -z "${2:-}" ]] || named=$(cat "$TASK/criteria/$2/check" 2>/dev/null || true)
  if printf '%s\n' "$1" | grep -Eiq -- "$MUTATION_RE" && ! allowed_external "$1"; then
    GUARD='not run: the command may change an external system'
  elif [[ "$(rget kind code)" == infra && "$1" != "$named" ]] && printf '%s\n' "$1" | grep -Eiq -- "$EXTERNAL_RE" && ! allowed_external "$1"; then
    GUARD='not run: an external command the plan did not fix (save its output as command-output evidence instead)'
  fi
  [[ -z "$GUARD" ]] || printf '%s\t%s\t%s\n' "${3:-script}" "$GUARD" "$1" >> "$TASK/refused"
}
constant_command() { # 0 when the command can only print fixed text or return a fixed status
  local rest=$1 seg word
  case "$rest" in *'$('*|*'`'*|*'<('*) return 1 ;; esac
  rest=$(printf '%s' "$rest" | tr ';&|' '\n\n\n')
  while IFS= read -r seg; do
    seg=$(trim "$seg"); seg=${seg#[\(\{]}; seg=$(trim "$seg")
    [[ -n "$seg" ]] || continue
    word=${seg%%[[:space:]]*}
    [[ "$word" =~ $CONSTANT_RE ]] || return 1
  done <<EOF
$rest
EOF
  return 0
}
# Verify one block of a check record. Appends "criterion|verdict|type|result|detail|class|sig|basis" to
# $VERDICT_FILE. basis is `plan` when a check fixed in the plan passed, `worker` when only a check the
# worker chose did: the script re-ran it but cannot tell whether it exercises the criterion.
judge_block() {
  local id=$1 ev out required res='' detail='' file named expect basis=saved
  [[ -n "$B_criterion" ]] || return 0
  SEEN="$SEEN $B_criterion"
  if [[ ! -d "$TASK/criteria/$B_criterion" ]]; then res=unsupported; detail='unknown criterion'
  else
    required=$(cat "$TASK/criteria/$B_criterion/type")
    ev=$(evidence_dir "$id"); out="$ev/take-$(iget "$id" takes).$B_criterion.out"
    case "$B_verdict" in PASS|FAIL|NOT_RUN) : ;; *) res=unsupported; detail="verdict must be PASS, FAIL or NOT_RUN" ;; esac
    if [[ -z "$res" && "$B_verdict" == NOT_RUN ]]; then
      if [[ "$B_class" == environment && -n "$B_reason" ]]; then res=notrun; detail=$(clean "$B_reason" 70); else res=unsupported; detail='NOT_RUN needs class: environment and a reason'; fi
    fi
    if [[ -z "$res" && "$B_type" != "$required" ]]; then res=unsupported; detail="evidence type $B_type does not satisfy a $required criterion"; fi
    if [[ -z "$res" && -z "$B_decisive" ]]; then res=unsupported; detail='no decisive output line quoted'; fi
    if [[ -z "$res" ]]; then
      if in_list "$B_type" "$TYPES_RUN"; then
        named=$(cat "$TASK/criteria/$B_criterion/check" 2>/dev/null || true); expect=$(cat "$TASK/criteria/$B_criterion/expect" 2>/dev/null || true)
        basis=worker
        guard_command "$B_command" "$B_criterion" "$(iname "$id")"
        if [[ -z "$B_command" ]]; then res=unsupported; detail='no command'
        elif [[ -n "$GUARD" ]]; then res=unsupported; detail=$GUARD
        elif [[ "$B_command" != "$named" ]] && constant_command "$B_command"; then
          res=unsupported; detail="$(clean "$B_command" 30) only prints fixed text: it does not exercise the criterion"
        else
          [[ "$B_timeout" =~ ^[0-9]+$ && "$B_timeout" -le 1800 && "$B_timeout" -ge 1 ]] || B_timeout=300
          run_check "$B_command" "$out" "$B_timeout"
          if [[ "$RUN_EXIT" == 126 || "$RUN_EXIT" == 127 ]]; then
            # The check did not start: that says nothing about the work.
            res=unsupported; detail="check could not start: $(clean "$B_command" 30) exit $RUN_EXIT"
          elif [[ "$B_verdict" == PASS ]]; then
            # A pass means exit status 0. The worker does not get to choose what success looks like.
            if [[ "$RUN_EXIT" != 0 ]]; then res=unsupported; detail="$(clean "$B_command" 30) exit $RUN_EXIT $(outsig "$out")"; ACC_RERUN=1
            elif [[ "$named" == "$B_command" && -n "$expect" ]] && ! grep -qF -- "$expect" "$out"; then res=unsupported; detail="output lacks the expected text $(outsig "$out")"; ACC_RERUN=1
            elif [[ ! -s "$out" ]]; then res=unsupported; detail="$(clean "$B_command" 30) printed nothing"
            elif ! grep -qF -- "$B_decisive" "$out"; then res=unsupported; detail="decisive line not in output $(outsig "$out")"
            else res=pass; detail="$(clean "$B_command" 50) exit $RUN_EXIT"; fi
            # A check or expected text the coordinator fixed in the plan outranks the worker's own choice.
            if [[ "$res" == pass && -n "$named" ]]; then
              basis=plan
              if [[ "$named" != "$B_command" ]]; then
                run_check "$named" "$out.named" 300
                if [[ "$RUN_EXIT" != 0 ]]; then res=unsupported; detail="named check $(clean "$named" 30) exit $RUN_EXIT $(outsig "$out.named")"; ACC_RERUN=1
                elif [[ -n "$expect" ]] && ! grep -qF -- "$expect" "$out.named" && ! grep -qF -- "$expect" "$out"; then res=unsupported; detail="output lacks the expected text $(outsig "$out.named")"; ACC_RERUN=1; fi
              elif [[ -n "$expect" ]] && ! grep -qF -- "$expect" "$out"; then
                res=unsupported; detail="output lacks the expected text $(outsig "$out")"; ACC_RERUN=1
              fi
            elif [[ "$res" == pass && -n "$expect" ]] && ! grep -qF -- "$expect" "$out"; then
              res=unsupported; detail="output lacks the expected text $(outsig "$out")"; ACC_RERUN=1
            fi
          else
            if [[ "$RUN_EXIT" == 0 ]]; then res=unsupported; detail="reported FAIL but $(clean "$B_command" 40) exits 0"
            else res=fail; detail="$(clean "$B_command" 30) exit $RUN_EXIT $(outsig "$out")"; ACC_RERUN=1; fi
          fi
        fi
      else
        file=$B_saved
        if [[ "$B_type" == inspection ]]; then file=${B_cite%%:*}; case "$file" in /*) : ;; *) file="$WORKSPACE/$file" ;; esac; fi
        if [[ -z "$file" || ! -s "$file" ]]; then res=unsupported; detail='cited or saved file is missing or empty'
        elif ! grep -qF -- "$B_decisive" "$file"; then res=unsupported; detail='quoted decisive line is not in the cited file'
        elif [[ "$B_type" == source && ( -z "$B_cite" || -z "$B_retrieved" ) ]]; then res=unsupported; detail='source needs cite and retrieved'
        elif [[ "$B_type" == command-output && -z "$B_command" ]]; then res=unsupported; detail='command-output needs the command'
        elif [[ "$B_type" == command-output ]] && printf '%s\n' "$B_command" | grep -Eiq -- "$MUTATION_RE" && ! allowed_external "$B_command"; then
          res=unsupported; detail='command may change an external system'
          printf '%s\t%s\n' "$(iname "$id")" "$B_command" >> "$TASK/mutations"
        elif [[ "$B_verdict" == PASS ]]; then res=pass; detail="$(clean "${B_cite:-$B_command}" 60)"
        else res=fail; detail="$(clean "${B_cite:-$B_command}" 60)"; fi
      fi
    fi
  fi
  detail=${detail//|/ }; B_sig=${B_sig//|/ }
  printf '%s|%s|%s|%s|%s|%s|%s|%s\n' "$B_criterion" "$B_verdict" "$B_type" "$res" "$detail" "$B_class" "$(clean "$B_sig" 60)" "$basis" >> "$VERDICT_FILE"
}
# Verify the check record of item $1's current take. Sets ACC_OK (1 supported), ACC_REASON,
# ACC_PASS, ACC_FAIL (criteria), ACC_NOTRUN (criteria).
accept_record() {
  local id=$1 ev rec line key val c
  ev=$(evidence_dir "$id"); rec="$ev/take-$(iget "$id" takes).checks.md"
  VERDICT_FILE="$ev/take-$(iget "$id" takes).verdict"
  : > "$VERDICT_FILE"
  ACC_OK=1; ACC_REASON=''; ACC_PASS=''; ACC_FAIL=''; ACC_NOTRUN=''; SEEN=''; ACC_RERUN=0
  if [[ ! -s "$rec" ]]; then ACC_OK=0; ACC_REASON='no check record'; return 0; fi
  B_criterion=''
  reset_block() { B_criterion=''; B_verdict=''; B_type=''; B_command=''; B_decisive=''; B_saved=''; B_cite=''; B_retrieved=''; B_class=''; B_sig=''; B_reason=''; B_timeout=''; }
  reset_block
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*([a-z]+):[[:space:]]*(.*)$ ]] || continue
    key=${BASH_REMATCH[1]}; val=$(strip_ticks "$(trim "${BASH_REMATCH[2]}")")
    case "$key" in
      criterion) judge_block "$id"; reset_block; B_criterion=$val ;;
      verdict) B_verdict=${val%% *} ;; type) B_type=${val%% *} ;; command) B_command=$val ;; exit) : ;;
      decisive) B_decisive=$val ;; saved) B_saved=$val ;; cite) B_cite=$val ;; retrieved) B_retrieved=$val ;;
      class) B_class=${val%% *} ;; sig) B_sig=$val ;; reason) B_reason=$val ;; timeout) B_timeout=${val%% *} ;;
    esac
  done < "$rec"
  judge_block "$id"
  for c in $(printf '%s' "$(iget "$id" criteria '')" | tr ',' ' '); do
    if ! in_list "$c" "$SEEN"; then ACC_OK=0; ACC_REASON="${ACC_REASON:+$ACC_REASON; }$c has no block"; fi
  done
  while IFS='|' read -r c _ _ line val _ _ _; do
    case "$line" in
      pass) ACC_PASS="$ACC_PASS $c" ;;
      fail) ACC_FAIL="$ACC_FAIL $c" ;;
      notrun) ACC_NOTRUN="$ACC_NOTRUN $c" ;;
      *) ACC_OK=0; ACC_REASON="${ACC_REASON:+$ACC_REASON; }$c: $val" ;;
    esac
  done < "$VERDICT_FILE"
  ACC_REASON=$(clean "$ACC_REASON" 90)
}

absorb_check_writes() { # batch: call after the script re-ran checks
  local name out rc=0 paths
  [[ "${RAN_CHECKS:-0}" == 1 ]] || return 0
  RAN_CHECKS=0
  name="checked-$1-$(( $(rget snapn 0) + 1 ))"; rput snapn $(( $(rget snapn 0) + 1 ))
  out=$(snap checkpoint "$TASK/state" "$(rget last_post)" "$name" -) || rc=$?
  [[ "$rc" == 0 || "$rc" == 3 ]] || die "snapshot checkpoint failed: $out"
  if [[ "$rc" == 3 ]]; then
    paths=$(printf '%s\n' "$out" | sed -n 's/^out-of-scope: //p' | tr '\n' ' ')
    printf '%s\n' "$paths" >> "$TASK/check-writes"
    printf 'note: re-running the recorded checks wrote files: %s(recorded; checks should write only to ignored paths or the evidence directory)\n' "$paths"
    snap checkpoint "$TASK/state" "$name" "$name" "$TASK/evidence/integrated-post-$1.patch" > /dev/null
  fi
  rput last_post "$name"
}

# ---- ladder ----------------------------------------------------------------------------------
stop_item() { # id reason
  iput "$1" status unresolved; iput "$1" stop_reason "$2"
  item_line end stopped "$1" "$(where "$1")$(sep)$2"
  event stopped "$(iname "$1")" "$2"
}
step_up() { # id reason
  local id=$1 from to old
  from=$(iget "$id" level); to=$((from + 1))
  level_me "$id" "$from"; old="$ME_MODEL/$ME_EFFORT"
  level_me "$id" "$to"
  iput "$id" level "$to"; iput "$id" status retry; iput "$id" sigcount 0; iput "$id" conts 0
  item_line effort effort "$id" "level $from$(arrow)$to$(sep)$old $(arrow) $ME_MODEL/$ME_EFFORT$(sep)$2"
  event effort "$(iname "$id")" "level $from to $to: $2"
}
# Decide what a failed take means. Results, not predictions, move an item.
advance() { # id outcome class sig [class source: worker|validator] [confirmed: check|validator]
  local id=$1 outcome=$2 class=$3 sig level top count same reason stage
  sig=$(clean "$4" 60); [[ -n "$sig" ]] || sig=$(printf '%s' "$outcome" | tr '[:upper:]' '[:lower:]')
  level=$(iget "$id" level); stage=$(istage "$id"); top=$(levels "$id")
  if [[ "$(iget "$id" sig '')" == "$sig" && "$(iget "$id" siglevel 0)" == "$level" ]]; then count=$(( $(iget "$id" sigcount 0) + 1 )); else count=1; fi
  iput "$id" sig "$sig"; iput "$id" siglevel "$level"; iput "$id" sigcount "$count"; iput "$id" class "$class"; iput "$id" last_outcome "$outcome"
  iput "$id" class_source "${5:-worker}"; iput "$id" confirmed "${6:-}"; iput "$id" classify_evidence ''
  printf '%s\t%s\n' "$level" "$sig" >> "$TASK/items/$id/sigs"
  reason=$sig
  if [[ "$(iget "$id" takes)" -ge "$(take_limit "$id")" ]]; then stop_item "$id" "take limit reached: $sig"; return 0; fi
  if [[ "$level" -gt "$CHEAP_TOP" ]]; then
    # The expensive model gets exactly one take: whatever ended it, the item stops. Nothing re-opens it.
    stop_item "$id" "the one expensive take ended without a pass: $sig"
    return 0
  fi
  case "$class" in
    ambiguity)
      iput "$id" status blocked
      item_line block blocked "$id" "needs your answer: $sig"
      event blocked "$(iname "$id")" "$sig"; return 0 ;;
    environment|throttle)
      if [[ "$class" == throttle ]]; then
        local width; width=$(width_cap)
        [[ "$width" != 0 ]] || { set -- $(cat "$TASK/batches/$(rget batch)/items"); width=$#; }
        rput throttle $(( width > 1 ? width / 2 : 1 ))
      fi
      if [[ "$(iget "$id" envretries 0)" -lt 2 ]]; then
        iput "$id" envretries $(( $(iget "$id" envretries 0) + 1 )); iput "$id" status retry
        item_line start retry "$id" "same level$(sep)$class: $sig"
        event retry "$(iname "$id")" "$class: $sig"
      else
        iput "$id" status blocked
        item_line block blocked "$id" "environment not fixed after 2 retries: $sig"
        event blocked "$(iname "$id")" "environment: $sig"
      fi
      return 0 ;;
  esac
  if [[ "$count" -lt 2 ]]; then
    if [[ "$outcome" == PARTIAL && "$(iget "$id" conts 0)" -lt "$N_CONT" ]]; then
      iput "$id" conts $(( $(iget "$id" conts 0) + 1 )); iput "$id" status retry; iput "$id" continue 1
      item_line start retry "$id" "same level$(sep)continue: $sig"
      event retry "$(iname "$id")" "continue: $sig"; return 0
    fi
  else
    reason="same failure twice: $sig"
  fi
  if [[ "$level" -lt "$CHEAP_TOP" ]]; then step_up "$id" "$reason"; return 0; fi
  # At the cheap model's top effort. Support stages stop here: they never use the expensive model.
  if [[ "$stage" != produce ]]; then stop_item "$id" "ladder exhausted: $sig"; return 0; fi
  same=1
  local l s
  for l in 1 2 3; do
    s=$(awk -F '\t' -v l="$l" '$1 == l { v = $2 } END { print v }' "$TASK/items/$id/sigs")
    [[ "$s" == "$sig" ]] || same=0
  done
  case "$(iget "$id" narrowed 0)" in
    0)
      iput "$id" status need-narrow; iput "$id" stuck "$same"
      printf 'note: %s failed at the cheap model'"'"'s top effort%s\n' "$(iname "$id")" "$(if [[ "$same" == 1 ]]; then printf ' with the same failure at every level'; fi)" ;;
    *)
      if [[ "$same" == 1 && "$(iget "$id" sig_before_narrow '')" == "$sig" ]]; then
        stop_item "$id" "no progress: same failure at every level and after narrowing: $sig"
      else iput "$id" status need-gate; fi ;;
  esac
}

# ---- results and batch close -----------------------------------------------------------------
cmd_result() {
  load_task "${1:-}"; shift
  [[ $# -ge 2 ]] || usage
  local id outcome class='' sig='' ran='' noprog=0 stage ev take dur worker=''
  id=$(iid "$1"); outcome=$2; shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --class) class=${2:-}; shift 2 ;;
      --sig) sig=${2:-}; shift 2 ;;
      --ran) ran=${2:-}; shift 2 ;;
      --worker) worker=${2:-}; shift 2 ;;
      --no-progress) noprog=1; shift ;;
      *) die "unknown option: $1" ;;
    esac
  done
  stage=$(istage "$id"); sig=$(scrub "$sig")
  [[ -z "$worker" ]] || iput "$id" worker "$(clean "$worker" 80)"
  [[ "$(iget "$id" status)" == running ]] || die "$(iname "$id") is not running (status: $(iget "$id" status))"
  if [[ "$stage" == verify ]]; then in_list "$outcome" 'PASS FAIL INCONCLUSIVE BLOCKED UNUSABLE' || die 'verify outcomes: PASS FAIL INCONCLUSIVE BLOCKED UNUSABLE'
  else in_list "$outcome" 'DONE PARTIAL BLOCKED FAIL UNUSABLE' || die 'map and produce outcomes: DONE PARTIAL BLOCKED FAIL UNUSABLE'; fi
  [[ -z "$class" ]] || in_list "$class" 'capability omission environment throttle flaky ambiguity scope' || die "unknown class: $class"
  ev=$(evidence_dir "$id"); take=$(iget "$id" takes)
  # A return without its record is an ordinary failure, whatever the worker says.
  if [[ "$outcome" == DONE || "$outcome" == PASS || ( "$stage" == verify && "$outcome" == FAIL ) ]]; then
    if [[ ! -s "$ev/take-$take.report.md" ]]; then outcome=UNUSABLE; sig='no report file'
    elif [[ "$stage" != map && ! -s "$ev/take-$take.checks.md" ]]; then outcome=UNUSABLE; sig='no check record'; fi
  fi
  if [[ "$outcome" == PARTIAL && "$noprog" == 1 ]]; then outcome=FAIL; [[ -n "$sig" ]] || sig='partial without progress'; fi
  dur=$(( $(now) - $(iget "$id" started) ))
  level_me "$id" "$(iget "$id" level)"
  local mism=''
  # The host may show a full model name for an alias: `claude-haiku-5-5/low` is `haiku/low`.
  if [[ -n "$ran" && "${ran%/*}" == *"$ME_MODEL"* && "${ran##*/}" == "$ME_EFFORT" ]]; then ran="$ME_MODEL/$ME_EFFORT"; fi
  if [[ -n "$ran" && "$ran" != "$ME_MODEL/$ME_EFFORT" ]]; then
    mism=" (requested $ME_MODEL/$ME_EFFORT, ran $ran)"
    rput mismatches $(( $(rget mismatches 0) + 1 ))
    if [[ "$(rget pinning unverified)" != relaxed ]]; then
      rput pinning mismatch; rput pinning_cause "$(clean "$(iname "$id") ran on $ran instead of $ME_MODEL/$ME_EFFORT" 160)"
    fi
  fi
  iput "$id" status returned; iput "$id" ret_outcome "$outcome"; iput "$id" ret_class "$class"; iput "$id" ret_sig "$sig"
  iput "$id" ret_dur "$dur"; iput "$id" ret_ran "${ran:-unavailable}"
  iput "$id" ret_tail "$(sep)$(elapsed "$dur")$mism"
  case "$outcome" in
    # A produce item is done only once the script has re-run its checks at batch close.
    DONE) [[ "$stage" == produce ]] || item_line ok done "$id" "$(where "$id")$(sep)$(elapsed "$dur")$mism" ;;
    PASS) : ;;
    FAIL) [[ "$stage" == verify ]] || item_line fail failed "$id" "$(where "$id")$(sep)$(elapsed "$dur")$(sep)$(clean "${sig:-$outcome}" 60)$mism" ;;
    *) item_line fail failed "$id" "$(where "$id")$(sep)$(elapsed "$dur")$(sep)$(clean "${sig:-$outcome}" 60)$mism" ;;
  esac
  event result "$(iname "$id")" "$outcome ${class:--} $(clean "${sig:--}" 60)"
  local other batch
  batch=$(rget batch)
  for other in $(cat "$TASK/batches/$batch/items"); do
    [[ "$(iget "$other" status)" == running ]] && { printf 'next: waiting for %s\n' "$(iname "$other")"; return 0; }
  done
  close_batch
}
# One history line per take, written once its real outcome is known.
record_take() { # id outcome class failure
  level_me "$1" "$(iget "$1" level)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(iget "$1" takes)" "$(iget "$1" level)" "$ME_MODEL/$ME_EFFORT" "$(iget "$1" ret_ran unavailable)" \
    "$(iget "$1" batch)" "$(iget "$1" ret_dur 0)" "$2" "${3:--}" "$(clean "${4:--}" 60)" "$ME_UNITS" >> "$TASK/items/$1/history"
}
close_batch() {
  local batch id globs='' out rc=0 stage paths pre
  batch=$(rget batch); pre=$(cat "$TASK/batches/$batch/pre")
  set -- $(cat "$TASK/batches/$batch/items")
  for id in "$@"; do
    if [[ "$(istage "$id")" == produce ]]; then
      globs="$globs $(printf '%s,%s' "$(iget "$id" owns)" "$(iget "$id" cleanup '')" | tr ',' ' ')"
    fi
  done
  globs="$globs $(rget extra_owns '')"
  mkdir -p "$TASK/evidence"
  set -f
  # shellcheck disable=SC2086
  out=$(snap checkpoint "$TASK/state" "$pre" "post-$batch" "$TASK/evidence/integrated-post-$batch.patch" $globs) || rc=$?
  set +f
  [[ "$rc" == 0 || "$rc" == 3 ]] || die "snapshot checkpoint failed: $out"
  rput last_post "post-$batch"
  printf '%s\n' "$out" | sed -n '1p' > "$TASK/batches/$batch/checkpoint"
  if [[ "$rc" == 3 ]]; then
    paths=$(printf '%s\n' "$out" | sed -n 's/^out-of-scope: //p' | tr '\n' ',' | sed 's/,$//')
    rput scope_block "$paths"
    say fail failed "$(printf '%-22s%s' "batch $batch" "out of scope: $(clean "$paths" 120)")"
    event scope "batch $batch" "$paths"
    printf 'next: a legitimate dependency? ledger.sh scope TASK extend GLOB. Otherwise ledger.sh scope TASK reject (the workers revert it on their next take).\n'
    return 0
  fi
  settle_batch
}
settle_batch() {
  local batch id stage outcome ndone=0 total=0 start
  batch=$(rget batch)
  set -- $(cat "$TASK/batches/$batch/items")
  stage=$(istage "$1")
  for id in "$@"; do
    total=$((total + 1))
    [[ "$(iget "$id" status)" == returned ]] || continue
    outcome=$(iget "$id" ret_outcome)
    case "$(istage "$id")" in
      map)
        record_take "$id" "$outcome" "$(iget "$id" ret_class '')" "$(iget "$id" ret_sig '')"
        if [[ "$outcome" == DONE ]]; then iput "$id" status done; ndone=$((ndone + 1))
        else advance "$id" "$outcome" "$(iget "$id" ret_class '')" "$(iget "$id" ret_sig '')"; fi ;;
      produce)
        if [[ "$outcome" == DONE ]]; then
          accept_record "$id"
          if [[ "$ACC_OK" == 1 && -z "$ACC_FAIL" && -z "$ACC_NOTRUN" ]]; then
            record_take "$id" DONE '' ''
            iput "$id" status done; iput "$id" confirmed ''; ndone=$((ndone + 1))
            item_line ok done "$id" "$(where "$id")$(iget "$id" ret_tail '')"
          else
            local why="$ACC_REASON"
            [[ -n "$why" ]] || why="check failed:$ACC_FAIL$ACC_NOTRUN"
            item_line fail failed "$id" "$(where "$id")$(iget "$id" ret_tail '')$(sep)$(clean "$why" 70)"
            record_take "$id" 'FAIL(check)' "$(iget "$id" ret_class '')" "$why"
            advance "$id" FAIL "$(iget "$id" ret_class '')" "$why" worker "$(if [[ "$ACC_RERUN" == 1 ]]; then printf check; fi)"
          fi
        else
          record_take "$id" "$outcome" "$(iget "$id" ret_class '')" "$(iget "$id" ret_sig '')"
          advance "$id" "$outcome" "$(iget "$id" ret_class '')" "$(iget "$id" ret_sig '')"
        fi ;;
      verify) : ;;
    esac
  done
  start=$(cat "$TASK/batches/$batch/start")
  printf '%s\n' "$(( $(now) - start ))" > "$TASK/batches/$batch/elapsed"
  rput batch_open ''
  if [[ "$stage" == verify ]]; then settle_verify "$@"; return 0; fi
  absorb_check_writes "$batch"
  if [[ "$total" -gt 1 ]]; then
    say end "batch $batch" "$ndone/$total done$(sep)$(elapsed "$(cat "$TASK/batches/$batch/elapsed")")"
  fi
  # Tier A has no validator: the script-run check on the captured state is the acceptance.
  if [[ "$N_V" == 0 && "$(produce_open)" == 0 ]]; then
    local nacc=0 ncrit=0 c
    for id in $(items); do
      if [[ "$(iget "$id" status)" == done ]]; then
        iput "$id" status accepted; nacc=$((nacc + 1))
        for c in $(printf '%s' "$(iget "$id" criteria '')" | tr ',' ' '); do
          ncrit=$((ncrit + 1)); printf '%s\tPASS\t%s\tscript re-run on post-%s\tplan\n' "$c" "$(cat "$TASK/criteria/$c/type")" "$batch" >> "$TASK/verified"
        done
      fi
    done
    if [[ "$nacc" -gt 0 ]]; then
      rput validated "$(rget last_post)"
      say ok passed "$(printf '%-22s%s' verify "script check$(sep)$ncrit/$ncrit criteria$(sep)units $(rget used)/$BUDGET")"
    fi
  fi
  if [[ "$(produce_open)" == 0 ]]; then
    rput frozen "$(rget last_post) (tree $(cat "$TASK/state/trees/$(rget last_post).tree"))"
    rput frozen_name "$(rget last_post)"; rput frozen_patch "$TASK/evidence/integrated-post-$batch.patch"
    refresh_verify_criteria
    # New work is frozen: every validator the tier requires owes a fresh verdict on exactly this state.
    if [[ "$N_V" -ge 1 ]] && produced_any; then reset_validators; fi
  fi
  next_hint
}
reset_validators() {
  local v
  rput validated ''
  for v in $(items); do
    [[ "$(istage "$v")" == verify ]] || continue
    case "$(iget "$v" status)" in passed|accepted) iput "$v" status ready ;; esac
    iput "$v" ok_frozen ''
  done
}
# Criteria that only unresolved items own cannot be verified; validators are not asked for them.
refresh_verify_criteria() {
  local c id keep='' owner alive
  [[ -d "$TASK/items/verify.checks" ]] || return 0
  for c in $(all_criteria); do
    [[ "$c" == R1 ]] && continue
    owner=0; alive=0
    for id in $(items); do
      [[ "$(istage "$id")" == produce ]] || continue
      if in_list "$c" "$(printf '%s' "$(iget "$id" criteria '')" | tr ',' ' ')"; then
        owner=1; [[ "$(iget "$id" status)" == unresolved ]] || alive=1
      fi
    done
    if [[ "$owner" == 0 || "$alive" == 1 ]]; then keep="$keep,$c"; fi
  done
  iput verify.checks criteria "${keep#,}"
}
settle_verify() {
  local id outcome supported=0 total=0 failed='' c owner hit crits=0 unsupported=0 batch line cls sg unowned='' missing='' nv=0 basis
  batch=$(rget batch)
  for id in "$@"; do
    total=$((total + 1))
    outcome=$(iget "$id" ret_outcome)
    case "$outcome" in
      PASS|FAIL)
        accept_record "$id"
        if [[ "$ACC_OK" == 1 && "$outcome" == FAIL && -z "$ACC_FAIL" ]]; then ACC_OK=0; ACC_REASON='the reply says FAIL but the record has no FAIL block'; fi
        if [[ "$ACC_OK" == 1 && -z "$ACC_FAIL" && -n "$ACC_NOTRUN" ]]; then
          # A required check that could not run is not a pass. The validator is blocked on its environment.
          unsupported=$((unsupported + 1))
          record_take "$id" NOT_RUN environment "check not run:$ACC_NOTRUN"
          item_line fail failed "$id" "$(where "$id")$(iget "$id" ret_tail '')$(sep)required check not run:$ACC_NOTRUN"
          advance "$id" BLOCKED environment "check not run:$ACC_NOTRUN"
        elif [[ "$ACC_OK" == 1 ]]; then
          supported=$((supported + 1)); failed="$failed$ACC_FAIL"
          iput "$id" last_outcome SUPPORTED; iput "$id" sig ''
          record_take "$id" "$outcome" '' "$(trim "$ACC_FAIL")"
          item_line ok done "$id" "$(where "$id")$(iget "$id" ret_tail '')$(if [[ -n "$ACC_FAIL" ]]; then printf '%sFAIL:%s' "$(sep)" "$ACC_FAIL"; fi)"
          if [[ -z "$ACC_FAIL" ]]; then iput "$id" status passed; iput "$id" ok_frozen "$(rget frozen_name)"; else iput "$id" status ready; fi
        else
          unsupported=$((unsupported + 1))
          record_take "$id" UNSUPPORTED capability "$ACC_REASON"
          item_line fail failed "$id" "$(where "$id")$(iget "$id" ret_tail '')$(sep)unsupported record: $ACC_REASON"
          advance "$id" FAIL capability "unsupported record: $ACC_REASON"
        fi ;;
      *)
        unsupported=$((unsupported + 1))
        cls=$(iget "$id" ret_class ''); sg=$(iget "$id" ret_sig '')
        # A validator that could not run is an environment problem unless it says otherwise; a useless return is its own failure.
        if [[ -z "$cls" && "$outcome" != UNUSABLE ]]; then cls=environment; fi
        record_take "$id" "$outcome" "$cls" "${sg:-$outcome}"
        advance "$id" "$outcome" "$cls" "${sg:-$outcome}" ;;
    esac
  done
  absorb_check_writes "$batch"
  if [[ -n "$failed" ]]; then
    # A correct FAIL is successful validation: the failed items move, the validators do not.
    rput cycle $(( $(rget cycle 0) + 1 ))
    reset_validators
    for c in $failed; do
      hit=0
      for owner in $(items); do
        [[ "$(istage "$owner")" == produce ]] || continue
        in_list "$c" "$(printf '%s' "$(iget "$owner" criteria '')" | tr ',' ' ')" || continue
        case "$(iget "$owner" status)" in done|accepted) : ;; *) continue ;; esac
        hit=1
        line=$(grep -h "^$c|" "$TASK"/evidence/checks/take-*.verdict "$TASK"/evidence/review/take-*.verdict 2>/dev/null | tail -n 1 || true)
        cls=$(printf '%s' "$line" | cut -d'|' -f6); sg=$(printf '%s' "$line" | cut -d'|' -f7)
        item_line fail failed "$owner" "$(where "$owner")$(sep)verify: $c ${sg:-failed}"
        advance "$owner" FAIL "${cls:-capability}" "verify $c: ${sg:-failed}" validator validator
      done
      if [[ "$hit" == 0 ]]; then
        unowned="$unowned $c"
        printf '%s\tFAIL\t%s\tno produce item owns this criterion\n' "$c" "$(cat "$TASK/criteria/$c/type")" >> "$TASK/unowned-fail"
      fi
    done
    # Validating the same workspace again cannot change the verdict: remember what failed.
    rput failed_frozen "$(rget frozen '')"; rput unowned_fail "$(trim "$unowned")"
    say fail failed "$(printf '%-22s%s' verify "$supported/$total validators$(sep)failed:$failed$(sep)units $(rget used)/$BUDGET")"
    if [[ -n "$unowned" ]]; then
      say block blocked "$(printf '%-22s%s' verify "no item owns the failed criterion:$unowned")"
    fi
  elif verify_dead; then
    say fail failed "$(printf '%-22s%s' verify "$supported/$total validators$(sep)a required validator was stopped, verification is incomplete$(sep)units $(rget used)/$BUDGET")"
  else
    # Acceptance needs the whole roster: every validator the tier requires, each with a supported
    # PASS on this same frozen state. They may have run in one batch or one after another.
    for id in $(items); do
      [[ "$(istage "$id")" == verify ]] || continue
      nv=$((nv + 1))
      if [[ "$(iget "$id" status)" != passed || "$(iget "$id" ok_frozen '')" != "$(rget frozen_name)" ]]; then missing="$missing $(iname "$id")"; fi
    done
    if [[ -z "$missing" ]]; then
      : > "$TASK/verified"
      for id in $(items); do
        [[ "$(istage "$id")" == verify ]] || continue
        while IFS='|' read -r c _ line cls _ _ _ basis; do
          [[ "$cls" == pass ]] || continue
          crits=$((crits + 1))
          printf '%s\tPASS\t%s\t%s on %s\t%s\n' "$c" "$line" "$(iname "$id") take $(iget "$id" takes)" "$(rget frozen_name)" "$basis" >> "$TASK/verified"
        done < "$(evidence_dir "$id")/take-$(iget "$id" takes).verdict"
        iput "$id" status accepted
      done
      for id in $(items); do [[ "$(iget "$id" status)" == done ]] && iput "$id" status accepted; done
      rput validated "$(rget last_post)"; rput failed_frozen ''; rput unowned_fail ''
      say ok passed "$(printf '%-22s%s' verify "$nv/$nv validators$(sep)$crits/$crits criteria$(sep)units $(rget used)/$BUDGET")"
    elif [[ "$unsupported" == 0 ]]; then
      printf 'note: verification is not complete: no supported PASS on %s yet from%s\n' "$(rget frozen_name)" "$missing"
    fi
  fi
  next_hint
}
cmd_scope() {
  load_task "${1:-}"; shift
  local paths id batch
  paths=$(rget scope_block '')
  [[ -n "$paths" ]] || die 'no out-of-scope change is waiting for a decision'
  batch=$(rget batch)
  case "${1:-}" in
    extend)
      [[ -n "${2:-}" ]] || usage
      rput extra_owns "$(rget extra_owns '') $2"
      event scope "batch $batch" "ownership extended: $2"
      local p left=''
      for p in $(printf '%s' "$paths" | tr ',' ' '); do
        # shellcheck disable=SC2053
        [[ "$p" == $2 || "$p" == "$2"/* ]] || left="$left,$p"
      done
      rput scope_block "${left#,}"
      if [[ -n "${left#,}" ]]; then printf 'note: still out of scope: %s\n' "${left#,}"; return 0; fi ;;
    reject)
      for id in $(cat "$TASK/batches/$batch/items"); do
        [[ "$(iget "$id" status)" == returned ]] || continue
        iput "$id" ret_outcome FAIL; iput "$id" ret_class scope; iput "$id" ret_sig "out-of-scope edit: $(clean "$paths" 40)"
        item_line fail failed "$id" "$(where "$id")$(iget "$id" ret_tail '')$(sep)out-of-scope edit: $(clean "$paths" 40)"
        iput "$id" cleanup "$(iget "$id" cleanup '')${paths:+,$paths}"
      done
      rput scope_block '' ;;
    *) usage ;;
  esac
  settle_batch
}

# ---- model gate ------------------------------------------------------------------------------
cmd_gate() {
  load_task "${1:-}"; shift
  local id impossible='' ev cheap=0 attop=0 take level me t dur outcome cls sg rest pass=0 c1 c2 c3 c4 c5 c6 owed class used source prev cur
  id=$(iid "${1:-}"); shift
  if [[ "${1:-}" == --narrowing-impossible ]]; then impossible=$(scrub "${2:-}"); [[ -n "$impossible" ]] || die 'give the reason narrowing is impossible'; fi
  [[ "$(istage "$id")" == produce ]] || die 'only produce items may move to the expensive model'
  if [[ -n "$impossible" && "$(iget "$id" status)" == need-narrow ]]; then
    iput "$id" narrowed impossible; iput "$id" narrow_reason "$impossible"; iput "$id" status need-gate
  fi
  [[ "$(iget "$id" status)" == need-gate ]] || die "$(iname "$id") is not at the gate (status: $(iget "$id" status)); the ladder decides when"
  ev=$(evidence_dir "$id"); mkdir -p "$ev"
  while IFS=$'\t' read -r take level me _ _ dur outcome cls sg rest; do
    if [[ "$level" -le "$CHEAP_TOP" ]]; then cheap=$((cheap + 1)); fi
    if [[ "$level" == "$CHEAP_TOP" ]]; then attop=$((attop + 1)); fi
  done < "$TASK/items/$id/history"
  class=$(iget "$id" class '')
  used=$(rget used)
  owed=$(owed_units "$id"); source=$(iget "$id" class_source worker)
  c1=FAIL; [[ "$attop" -ge 1 && "$cheap" -ge "$N_GATE_MIN" ]] && c1=PASS
  c2=PASS
  t=2
  prev=''
  while [[ "$t" -le "$(iget "$id" takes)" ]]; do
    # A retry that only repeats the previous instruction is the same approach again.
    cur=$(iget "$id" "corr.$t" ''); cur=${cur#Take * ended }
    if [[ -z "$cur" || "$cur" == "$prev" ]]; then c2=FAIL; fi
    prev=$cur; t=$((t + 1))
  done
  # The producing worker's own word does not classify its failure: a separate finished map item or a validator must.
  c3=FAIL; [[ "$class" == capability ]] && in_list "$source" 'diagnosis validator' && c3=PASS
  c4=FAIL; in_list "$(iget "$id" confirmed '')" 'check validator' && c4=PASS
  c5=FAIL; case "$(iget "$id" narrowed 0)" in 1|impossible) c5=PASS ;; esac
  c6=FAIL; [[ $((used + WEIGHT + owed)) -le "$BUDGET" ]] && c6=PASS
  for t in $c1 $c2 $c3 $c4 $c5 $c6; do [[ "$t" == PASS ]] && pass=$((pass + 1)); done
  {
    printf '# Escalation record: %s\n\n' "$(iname "$id")"
    printf 'Written by ledger.sh gate before any expensive-model dispatch. Result: %s/6.\n\n' "$pass"
    printf '1. %s — cheap model exhausted: %s cheap takes (minimum %s), %s at its top effort.\n' "$c1" "$cheap" "$N_GATE_MIN" "$attop"
    printf '2. %s — every retry carried its own correction citing the prior record; none repeated the previous instruction.\n' "$c2"
    printf '3. %s — failure class: %s, classified by %s%s.\n' "$c3" "${class:-unclassified}" "$(if [[ "$source" == worker ]]; then printf 'the failing worker only (not accepted)'; else printf 'a %s' "$source"; fi)" "$(if [[ -n "$(iget "$id" classify_evidence '')" ]]; then printf ' (%s)' "$(iget "$id" classify_evidence)"; fi)"
    printf '4. %s — independent confirmation: %s.\n' "$c4" "$(confirmed_text "$(iget "$id" confirmed '')")"
    printf '5. %s — narrowing: %s.\n' "$c5" "$(narrowing_text "$id")"
    printf '6. %s — budget: used %s + expensive call %s + still owed (other first takes, validation, reserve) %s of %s units.\n\n' "$c6" "$used" "$WEIGHT" "$owed" "$BUDGET"
    printf '| Take | Level | Model/effort | Outcome | Class | Failure | Correction given | Records |\n|---|---|---|---|---|---|---|---|\n'
    while IFS=$'\t' read -r take level me _ _ dur outcome cls sg rest; do
      printf '| %s | %s | %s | %s | %s | %s | %s | %s/take-%s.* |\n' "$take" "$level" "$me" "$outcome" "$cls" "$sg" "$(clean "$(iget "$id" "corr.$take" '-')" 80)" "$ev" "$take"
    done < "$TASK/items/$id/history"
  } > "$ev/escalation.md"
  if [[ "$pass" == 6 ]]; then
    local from to old
    from=$(iget "$id" level); to=$((CHEAP_TOP + 1))
    level_me "$id" "$from"; old="$ME_MODEL/$ME_EFFORT"
    level_me "$id" "$to"
    iput "$id" level "$to"; iput "$id" status retry; iput "$id" sigcount 0; iput "$id" conts 0
    item_line model model "$id" "level $from$(arrow)$to$(sep)$old $(arrow) $ME_MODEL/$ME_EFFORT$(sep)$(clean "$(iget "$id" sig 'capability failure')" 40)$(sep)gate 6/6$(sep)escalation.md"
    event model "$(iname "$id")" "gate 6/6 $ev/escalation.md"
    sed -n '/^[1-6]\. /p' "$ev/escalation.md"
    printf 'next: ledger.sh dispatch TASK %s\n' "$(iname "$id")"
    return 0
  fi
  printf 'gate %s/6 for %s: no expensive dispatch. Record: %s\n' "$pass" "$(iname "$id")" "$ev/escalation.md"
  sed -n '/^[1-6]\. /p' "$ev/escalation.md"
  local diag
  diag="plan a read-only map item and dispatch it: item map why-$(islug "$id" | cut -c1-16) | Why does $(iname "$id") fail? Read the records under $ev. End the report with the lines class:, reproduced: and command: (one of the item's own recorded checks)"
  [[ "$c1" == PASS ]] || printf 'next: condition 1 — dispatch another corrected take at the cheap model'"'"'s top effort: ledger.sh dispatch TASK %s --correction "<what to do differently>"\n' "$(iname "$id")"
  [[ "$c2" == PASS ]] || printf 'next: condition 2 — a retry repeated the previous instruction: ledger.sh dispatch TASK %s --correction "<what to do differently>"\n' "$(iname "$id")"
  if [[ "$c3" != PASS ]]; then
    if [[ -z "$class" || "$class" == - || ( "$class" == capability && "$source" == worker ) ]]; then
      printf 'next: condition 3 — %s. Then: ledger.sh classify TASK %s <class> --by map/why-%s\n' "$diag" "$(iname "$id")" "$(islug "$id" | cut -c1-16)"
    else
      printf 'next: condition 3 — class "%s" never escalates the model: fix the cause (brief, environment, check, spec, ownership) with ledger.sh dispatch TASK %s --correction "…", or ledger.sh stop TASK %s "<why>"\n' "$class" "$(iname "$id")" "$(iname "$id")"
    fi
  fi
  [[ "$c4" == PASS ]] || printf 'next: condition 4 — no check the script re-ran has failed and no validator reported a reproduced FAIL: %s (reproduced: yes needs a command: that is a plan check or a recorded check of this item, which the script re-runs)\n' "$diag"
  [[ "$c6" == PASS ]] || printf 'next: condition 6 — the budget does not admit the expensive call: ledger.sh stop TASK %s budget\n' "$(iname "$id")"
}
# Is this command one of the item's own checks: fixed in the plan, or recorded by a worker for one of its criteria?
item_check_known() { # id command
  local c f known
  for c in $(printf '%s' "$(iget "$1" criteria '')" | tr ',' ' '); do
    [[ "$(cat "$TASK/criteria/$c/check" 2>/dev/null || true)" == "$2" ]] && return 0
  done
  for f in "$(evidence_dir "$1")"/take-*.checks.md "$TASK"/evidence/checks/take-*.checks.md "$TASK"/evidence/review/take-*.checks.md; do
    [[ -f "$f" ]] || continue
    while IFS= read -r known; do
      [[ "$(strip_ticks "$(trim "$known")")" == "$2" ]] && return 0
    done <<EOF
$(sed -n 's/^[[:space:]]*command:[[:space:]]*//p' "$f")
EOF
  done
  return 1
}
cmd_classify() {
  load_task "${1:-}"; shift
  local id class evidence='' mid='' m
  id=$(iid "${1:-}"); class=${2:-}
  in_list "$class" 'capability omission environment throttle flaky ambiguity scope' || die "unknown class: $class"
  # The diagnosis is the report of a separate, finished, read-only item: not a path the coordinator picks.
  case "${3:-}" in
    --by) mid=$(iid "${4:-}") ;;
    --evidence)
      for m in $(items); do
        [[ "$(istage "$m")" == map && "${4:-}" -ef "$(evidence_dir "$m")/take-$(iget "$m" takes).report.md" ]] && mid=$m
      done
      [[ -n "$mid" ]] || die "that file is not the report of a map item of this run. A failing worker's own report does not classify its failure: plan the map item the gate prints, dispatch it, then classify --by map/<slug>" ;;
    *) die 'classify needs --by map/<slug>: the finished read-only item that diagnosed the failure' ;;
  esac
  [[ "$(istage "$mid")" == map ]] || die 'the diagnosis must come from a map item'
  [[ "$(iget "$mid" status)" == done ]] || die "$(iname "$mid") has not finished (status: $(iget "$mid" status)); dispatch it and record its result first"
  [[ "$(iget "$mid" batch 0)" -gt "$(iget "$id" batch 0)" ]] || die "$(iname "$mid") ran before the latest take of $(iname "$id"); plan and dispatch a fresh map item for this failure"
  evidence="$(evidence_dir "$mid")/take-$(iget "$mid" takes).report.md"
  [[ -s "$evidence" ]] || die "$(iname "$mid") left no report file"
  grep -Eq "^[[:space:]]*class:[[:space:]]*$class[[:space:]]*$" "$evidence" || die "the report of $(iname "$mid") must itself say 'class: $class'; the coordinator does not classify from memory"
  iput "$id" class "$class"; iput "$id" class_source diagnosis; iput "$id" classify_evidence "$(iname "$mid"): $evidence"
  if grep -Eq '^[[:space:]]*reproduced:[[:space:]]*yes' "$evidence" && [[ -z "$(iget "$id" confirmed '')" ]]; then
    local command out
    command=$(sed -n 's/^[[:space:]]*command:[[:space:]]*//p' "$evidence" | tail -n 1)
    command=$(strip_ticks "$(trim "$command")")
    out="$(evidence_dir "$id")/classify.out"; mkdir -p "$(evidence_dir "$id")"
    if [[ -z "$command" ]]; then printf 'note: the diagnosis says reproduced but names no command: line; the failure stays unconfirmed\n'
    elif ! item_check_known "$id" "$command" || constant_command "$command"; then
      printf 'note: %s is neither a plan check of this item'"'"'s criteria nor a command from its check records, so its failing proves nothing about the item; the failure stays unconfirmed\n' "$(clean "$command" 60)"
    else
      guard_command "$command" '' "$(iname "$mid")"
      if [[ -n "$GUARD" ]]; then printf 'note: %s was %s; the failure stays unconfirmed\n' "$(clean "$command" 60)" "$GUARD"
      else
        run_check "$command" "$out" 300
        if [[ "$RUN_EXIT" == 126 || "$RUN_EXIT" == 127 ]]; then printf 'note: %s could not start (exit %s): an environment problem, not a confirmed failure\n' "$(clean "$command" 60)" "$RUN_EXIT"
        elif [[ "$RUN_EXIT" != 0 ]]; then iput "$id" confirmed check; printf 'reproduced: %s exits %s\n' "$(clean "$command" 60)" "$RUN_EXIT"
        else printf 'note: the diagnosis says reproduced, but %s exits 0 here; the failure stays unconfirmed\n' "$(clean "$command" 60)"; fi
      fi
    fi
  fi
  event classify "$(iname "$id")" "$class by $(iname "$mid")"
  printf 'classified %s as %s\n' "$(iname "$id")" "$class"
  next_hint
}
pinning_help() { printf 'Workers would not run on the requested model or effort, so nothing is dispatched. Tell the user. Either they correct the configuration and you start a new run, or they accept it in their own words: ledger.sh pinning TASK accept "<what the user said>" (the report then says so)'; }
drift_help() { printf 'The script never reverts them. If they are expected (the user'"'"'s own edits, a commit you made), record who changed them: ledger.sh drift TASK accept "<who and why>"; they then count as part of the work and validation runs again on that state. Otherwise ask the user'; }
cmd_drift() { # files changed outside any dispatch: nothing is validated silently, nothing is reverted
  load_task "${1:-}"; shift
  local snapname paths id
  [[ "${1:-}" == accept && -n "${2:-}" ]] || die 'write: ledger.sh drift TASK accept "<who changed the files and why>"'
  paths=$(rget drift_block ''); snapname=$(rget drift_snap '')
  [[ -n "$paths" ]] || die 'no change outside a dispatch is waiting for a decision'
  printf '%s (accepted: %s)\n' "$paths" "$(clean "$(scrub "$2")" 100)" >> "$TASK/gap-changes"
  rput drift_block ''; rput last_post "$snapname"
  event drift - "accepted: $paths"
  # What was frozen or validated before is no longer what is on disk.
  if [[ -n "$(rget frozen_name '')" ]]; then
    snap checkpoint "$TASK/state" "$snapname" "$snapname" "$TASK/evidence/integrated-$snapname.patch" > /dev/null
    rput frozen "$snapname (tree $(cat "$TASK/state/trees/$snapname.tree"))"; rput frozen_name "$snapname"
    rput frozen_patch "$TASK/evidence/integrated-$snapname.patch"; rput failed_frozen ''
    for id in $(items); do
      [[ "$(istage "$id")" == produce && "$(iget "$id" status)" == accepted ]] && iput "$id" status done
    done
    reset_validators
  fi
  printf 'note: recorded. %s\n' "$(if [[ "$N_V" -ge 1 ]]; then printf 'Validation runs again on the changed state.'; else printf 'This tier has no validator: work accepted before the change is reported as produced, not verified.'; fi)"
  next_hint
}
# After a compaction the coordinator may no longer hold its workers. Their report files end with the
# reply block, so finished ones can be recorded from disk; the rest are named.
cmd_reconcile() {
  load_task "${1:-}"
  local id f tail outcome class sig batch
  [[ -n "$(rget batch_open '')" ]] || die 'no batch is open: nothing to reconcile; run ledger.sh status TASK'
  batch=$(rget batch)
  for id in $(cat "$TASK/batches/$batch/items"); do
    [[ "$(iget "$id" status)" == running ]] || continue
    f="$(evidence_dir "$id")/take-$(iget "$id" takes).report.md"
    outcome=''; class=''; sig=''
    if [[ -s "$f" ]]; then
      tail=$(awk '/^[[:space:]]*outcome:/ { buf = "" } { buf = buf $0 "\n" } END { printf "%s", buf }' "$f")
      outcome=$(printf '%s\n' "$tail" | sed -n '1s/^[[:space:]]*outcome:[[:space:]]*\([A-Z_]*\).*/\1/p')
      class=$(printf '%s\n' "$tail" | sed -n 's/^[[:space:]]*class:[[:space:]]*\([a-z]*\).*/\1/p' | head -n 1)
      sig=$(printf '%s\n' "$tail" | sed -n 's/^[[:space:]]*signature:[[:space:]]*//p' | head -n 1)
    fi
    if [[ "$(istage "$id")" == verify ]]; then in_list "$outcome" 'PASS FAIL INCONCLUSIVE BLOCKED' || outcome=''
    else in_list "$outcome" 'DONE PARTIAL BLOCKED FAIL' || outcome=''; fi
    in_list "$class" 'capability omission environment throttle flaky ambiguity scope' || class=''
    if [[ -z "$outcome" ]]; then
      printf 'note: %s has no finished report for take %s: its worker is still running or was lost. If you still hold it, wait for its reply. If it is gone: ledger.sh result TASK %s UNUSABLE --sig "worker lost"\n' "$(iname "$id")" "$(iget "$id" takes)" "$(iname "$id")"
      continue
    fi
    printf 'note: %s finished with %s according to its report file; recording it\n' "$(iname "$id")" "$outcome"
    if [[ -n "$class" ]]; then cmd_result "$TASK" "$(iname "$id")" "$outcome" --class "$class" --sig "$sig"
    else cmd_result "$TASK" "$(iname "$id")" "$outcome" --sig "$sig"; fi
  done
}
cmd_pinning() { # the host overrides, hides or rejects the requested model or effort
  load_task "${1:-}"; shift
  local text
  text=$(scrub "${2:-}")
  case "${1:-}" in
    mismatch)
      [[ -n "$text" ]] || die 'write: ledger.sh pinning TASK mismatch "what the host overrides, hides or rejects"'
      rput pinning mismatch
      rput pinning_cause "$(clean "$(rget pinning_cause '')$(if [[ -n "$(rget pinning_cause '')" ]]; then printf '; '; fi)$text" 160)"
      event pinning - "$text"
      say block blocked "$(printf '%-22s%s' pinning "known mismatch ($(clean "$text" 100)); dispatch stops until the user decides")" ;;
    accept)
      # Workers outside the prescribed models or efforts run only on the user's explicit word, and the run is labelled.
      [[ -n "$text" ]] || die 'write: ledger.sh pinning TASK accept "<what the user said>"'
      [[ "$(rget pinning unverified)" == mismatch ]] || die 'no known mismatch is waiting for a decision'
      rput pinning relaxed; rput pinning_accept "$(clean "$text" 160)"
      event pinning - "accepted by the user: $text"
      say start run "$(printf '%-22s%s' pinning "relaxed by the user ($(clean "$text" 80)); workers may run outside the ladder: $(rget pinning_cause)")" ;;
    *) die 'write: ledger.sh pinning TASK mismatch "…" or ledger.sh pinning TASK accept "…"' ;;
  esac
  next_hint
}
cmd_answer() {
  load_task "${1:-}"; shift
  local id; id=$(iid "${1:-}")
  [[ -n "${2:-}" ]] || usage
  [[ "$(iget "$id" status)" == blocked ]] || die "$(iname "$id") is not blocked"
  if has_secret "$2"; then die "the answer holds $SECRET_HIT; name the variable instead of writing its value. Nothing was stored."; fi
  printf -- '- (%s) %s\n' "$(islug "$id")" "$2" >> "$TASK/decisions.md"
  iput "$id" status retry; iput "$id" envretries 0
  event answer "$(iname "$id")" "$2"
  next_hint
}
cmd_stop() {
  load_task "${1:-}"; shift
  local id; id=$(iid "${1:-}")
  case "$(iget "$id" status)" in running|returned) die "$(iname "$id") is still in an open batch" ;; esac
  stop_item "$id" "$(clean "$(scrub "${2:-stopped by the coordinator}")" 70)"
  if [[ "$(produce_open)" == 0 ]]; then refresh_verify_criteria; fi
  next_hint
}
cmd_promote() {
  load_task "${1:-}"; shift
  local to=${1:-} old=$TIER oldbudget=$BUDGET
  [[ "$to" > "$old" ]] && in_list "$to" 'B C D' || die "promote only upward from tier $old"
  host_numbers "$HOST" "$to"
  [[ "$N_BUDGET" -gt "$oldbudget" ]] && BUDGET=$N_BUDGET
  TIER=$to; rput tier "$to"; rput budget "$BUDGET"; rput tier_from "$old"; rput validated ''
  ensure_verify_items
  say start run "tier $old$(arrow)$to$(sep)budget $BUDGET units$(sep)$(clean "$(scrub "${2:-promoted}")" 60)"
  event promote - "$old to $to: ${2:-}"
  next_hint
}

# ---- what next -------------------------------------------------------------------------------
next_hint() {
  local id st ready='' any=0 nprod=0
  if [[ -n "$(rget scope_block '')" ]]; then printf 'next: resolve out-of-scope changes: ledger.sh scope TASK extend GLOB | reject\n'; return 0; fi
  if [[ -n "$(rget batch_open '')" ]]; then
    printf 'next: batch %s is open; record each return: ledger.sh result TASK STAGE/SLUG OUTCOME. Still running:' "$(rget batch)"
    for id in $(cat "$TASK/batches/$(rget batch)/items"); do [[ "$(iget "$id" status)" == running ]] && printf ' %s' "$(iname "$id")"; done
    printf '. If you no longer hold these workers (after a compaction): ledger.sh reconcile TASK\n'; return 0
  fi
  if [[ -n "$(rget drift_block '')" ]]; then printf 'next: files changed outside any dispatch: %s. %s\n' "$(rget drift_block)" "$(drift_help)"; return 0; fi
  if [[ "$(rget pinning unverified)" == mismatch ]]; then printf 'next: pinning: known mismatch (%s). %s\n' "$(rget pinning_cause)" "$(pinning_help)"; return 0; fi
  for id in $(items); do
    st=$(iget "$id" status)
    [[ "$(istage "$id")" == produce ]] && nprod=$((nprod + 1))
    case "$st" in
      need-narrow) any=1; printf 'next: narrow %s — one failing criterion, decisions pre-made: ledger.sh dispatch TASK %s --narrow "…" (or: ledger.sh gate TASK %s --narrowing-impossible "why")\n' "$(iname "$id")" "$(iname "$id")" "$(iname "$id")" ;;
      need-gate) any=1; printf 'next: gate %s — ledger.sh gate TASK %s (it writes escalation.md and decides)\n' "$(iname "$id")" "$(iname "$id")" ;;
      blocked) any=1; printf 'next: %s is blocked — ask the user or fix the environment, then: ledger.sh answer TASK %s "…" (or ledger.sh stop)\n' "$(iname "$id")" "$(iname "$id")" ;;
      ready|retry)
        if [[ "$(istage "$id")" == verify ]]; then [[ "$(produce_open)" == 0 && -z "$(rget validated '')" ]] && produced_any && ! verify_dead && ! verify_stale && ready="$ready $(iname "$id")"
        elif deps_done "$id"; then ready="$ready $(iname "$id")"; fi ;;
    esac
  done
  if [[ -n "$ready" ]]; then printf 'next: ledger.sh dispatch TASK   (ready:%s)\n' "$ready"; return 0; fi
  [[ "$any" == 0 ]] || return 0
  if verify_stale && [[ -n "$(rget unowned_fail '')" ]]; then
    printf 'next: validation failed on %s, which no produce item owns. Plan a fix (ledger.sh plan TASK with: item produce <slug> | <the fix the validator asks for> | owns: <globs> | criteria: %s), or ledger.sh report TASK to end with it unresolved\n' "$(rget unowned_fail)" "$(rget unowned_fail | tr ' ' ',')"
    return 0
  fi
  if [[ "$nprod" == 0 ]]; then printf 'next: plan the produce items from the map reports: ledger.sh plan TASK\n'; return 0; fi
  printf 'next: ledger.sh report TASK\n'
}
# The one acceptance rule, used by status and by the report: every item accepted, the whole validator
# roster passed on one frozen state, nothing unresolved about scope or outside changes, and (in the
# report) the workspace still is that state. Prints `complete` or the first reason it is not.
open_reason() { # [paths changed after validation]
  local id st
  if [[ -n "$(rget scope_block '')" ]]; then printf 'incomplete (out-of-scope changes unresolved)'; return 0; fi
  if [[ -n "$(rget drift_block '')" ]]; then printf 'incomplete (changes outside any dispatch unresolved)'; return 0; fi
  if [[ -n "$(rget batch_open '')" ]]; then printf 'incomplete (a batch is open)'; return 0; fi
  for id in $(items); do
    [[ "$(istage "$id")" == verify ]] && continue
    st=$(iget "$id" status)
    [[ "$st" == accepted || ( "$st" == done && "$(istage "$id")" == map ) ]] || { printf 'incomplete (%s is %s)' "$(iname "$id")" "$st"; return 0; }
  done
  if [[ -z "$(rget validated '')" ]]; then printf 'incomplete (nothing validated)'; return 0; fi
  if [[ -n "$(trim "${1:-}")" ]]; then printf 'INVALID (the workspace changed after validation: what was accepted is not what is on disk)'; return 0; fi
  printf 'complete'
}
cmd_status() {
  load_task "${1:-}"
  local id
  printf 'task %s\nworkspace %s\nskill %s\n' "$TASK" "$WORKSPACE" "$SKILL_DIR"
  printf 'host %s · tier %s · kind %s · coordinator %s · units %s/%s · batch %s%s · repair cycles %s · frozen %s · validated %s\n' \
    "$HOST" "$TIER" "$(rget kind)" "$(rget coordinator unknown)" "$(rget used 0)" "$BUDGET" "$(rget batch 0)" \
    "$(if [[ -n "$(rget batch_open '')" ]]; then printf ' (open)'; fi)" "$(rget cycle 0)" "$(rget frozen_name -)" "$(rget validated -)"
  printf 'pinning %s %s\n' "$(rget pinning unverified)" "$(rget pinning_cause '')"
  printf 'width: host slots %s · plan limit %s · throttle %s (0 = none)\n' "$(rget slots 0)" "$(rget limit 0)" "$(rget throttle 0)"
  printf 'acceptance: %s\n' "$(open_reason)"
  for id in $(items); do
    printf '%-26s %-11s %s%s%s\n' "$(iname "$id")" "$(iget "$id" status)" "$(where "$id")" \
      "$(if [[ -n "$(iget "$id" sig '')" ]]; then printf ' · last: %s' "$(iget "$id" sig)"; fi)" \
      "$(if [[ -n "$(iget "$id" worker '')" ]]; then printf ' · worker: %s' "$(iget "$id" worker)"; fi)"
  done
  if [[ -f "$TASK/decisions.md" ]]; then printf 'decisions: %s (in %s)\n' "$(wc -l < "$TASK/decisions.md" | tr -d ' ')" "$TASK/decisions.md"; fi
  next_hint
}

# ---- final report ----------------------------------------------------------------------------
secret_scan() { # prints file names only, never values
  local name value hits=''
  for name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | grep -Ei '(secret|token|password|passwd|credential|api_?key|access_?key|private_?key)' || true); do
    value=${!name:-}
    [[ ${#value} -ge 8 ]] || continue
    hits="$hits $(grep -rlF -- "$value" "$TASK/evidence" "$TASK/briefs" "$TASK/items" "$TASK/criteria" "$TASK/log.txt" "$TASK/ledger.tsv" "$TASK/commands.log" "$TASK/decisions.md" "$TASK/request.md" "$TASK/allowed-external.md" 2>/dev/null | tr '\n' ' ' || true)"
  done
  hits="$hits $(grep -rlE -- '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{32,})' "$TASK/evidence" "$TASK/briefs" 2>/dev/null | tr '\n' ' ' || true)"
  printf '%s' "$(trim "$hits")"
}
cmd_report() {
  load_task "${1:-}"; shift
  local external='' usage_text='' id st accepted=0 unresolved=0 total=0 out rc=0 drift='' secrets muts=0 low=0 med=0 high=0 exp=0
  local take level me ran batch dur outcome cls sg units f verdict='Requested but unverified' b final state soft='' refused=0
  while [[ $# -gt 0 ]]; do
    case "$1" in --external) external=$(scrub "${2:-}"); shift 2 ;; --usage) usage_text=$(scrub "${2:-}"); shift 2 ;; *) die "unknown option: $1" ;; esac
  done
  [[ -z "$(rget batch_open '')" ]] || die 'a batch is still open; record its results first'
  # Every report looks at the workspace as it is now: an earlier report proves nothing about today.
  rput reports $(( $(rget reports 0) + 1 )); final="final-$(rget reports)"
  if [[ -n "$(rget validated '')" ]]; then
    out=$(snap checkpoint "$TASK/state" "$(rget validated)" "$final" -) || rc=$?
    [[ "$rc" == 0 ]] || drift=$(printf '%s\n' "$out" | sed -n 's/^out-of-scope: //p' | tr '\n' ' ')
  else snap capture "$TASK/state" "$final" > /dev/null; fi
  state=$(open_reason "$drift")
  for id in $(items); do
    [[ "$(istage "$id")" == verify ]] && continue
    total=$((total + 1)); st=$(iget "$id" status)
    case "$st" in accepted) accepted=$((accepted + 1)) ;; done) if [[ "$(istage "$id")" == map ]]; then accepted=$((accepted + 1)); else unresolved=$((unresolved + 1)); fi ;; *) unresolved=$((unresolved + 1)) ;; esac
  done
  secrets=$(secret_scan)
  for f in "$TASK"/evidence/*/take-*.commands.log; do
    [[ -f "$f" ]] || continue
    while IFS= read -r out; do
      if printf '%s\n' "$out" | grep -Eiq -- "$MUTATION_RE" && ! allowed_external "$out"; then printf '%s\t%s\n' "${f#"$TASK/evidence/"}" "$out" >> "$TASK/mutations"; fi
    done < "$f"
  done
  [[ ! -f "$TASK/mutations" ]] || muts=$(sort -u "$TASK/mutations" | wc -l | tr -d ' ')
  [[ ! -f "$TASK/refused" ]] || refused=$(sort -u "$TASK/refused" | wc -l | tr -d ' ')
  [[ ! -s "$TASK/verified" ]] || soft=$(awk -F '\t' '$5 == "worker" { printf " %s", $1 }' "$TASK/verified")
  # Verified only when the host showed, for every call, the settings that were requested.
  local shown=0 calls=0
  for id in $(items); do
    [[ -f "$TASK/items/$id/history" ]] || continue
    while IFS=$'\t' read -r take level me ran batch dur outcome cls sg units; do
      calls=$((calls + 1)); [[ "$ran" == "$me" ]] && shown=$((shown + 1))
    done < "$TASK/items/$id/history"
  done
  if [[ "$(rget pinning unverified)" == relaxed ]]; then verdict="Known mismatch, accepted by the user ($(rget pinning_cause); the user: $(rget pinning_accept))"
  elif [[ "$(rget pinning unverified)" == mismatch ]]; then verdict="Known mismatch ($(rget pinning_cause))"
  elif [[ "$(rget mismatches 0)" != 0 ]]; then verdict="Known mismatch ($(rget mismatches) call(s) ran on other settings than requested)"
  elif [[ "$calls" -gt 0 && "$shown" == "$calls" ]]; then verdict='Verified'; fi
  {
    printf 'Tier: %s%s\n' "$TIER" "$(if [[ -n "$(rget tier_from '')" ]]; then printf ' (promoted from %s)' "$(rget tier_from)"; fi)"
    printf 'Kind: %s\n' "$(rget kind)"
    printf 'Coordinator: %s\n' "$(rget coordinator unknown)"
    printf 'Outcome: %s/%s items accepted, %s unresolved; %s units of %s used; state: %s\n' "$accepted" "$total" "$unresolved" "$(rget used 0)" "$BUDGET" "$state"
    printf 'Ledger: stage/item | take | level | requested | ran | batch | elapsed | outcome | class | failure | units\n'
    for id in $(items); do
      [[ -f "$TASK/items/$id/history" ]] || continue
      while IFS=$'\t' read -r take level me ran batch dur outcome cls sg units; do
        printf '  %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s\n' "$(iname "$id")" "$take" "$level" "$me" "$ran" "$batch" "$(elapsed "$dur")" "$outcome" "$cls" "$sg" "$units"
        case "$me" in "$N_EXP"/*) exp=$((exp + 1)) ;; */low) low=$((low + 1)) ;; */medium) med=$((med + 1)) ;; */high) high=$((high + 1)) ;; esac
      done < "$TASK/items/$id/history"
    done
    printf 'Pinning: %s; %s of %s call(s) shown by the host as run on the requested settings, %s on other settings\n' "$verdict" "$shown" "$calls" "$(rget mismatches 0)"
    printf 'Parallelism: %s batches | peak %s concurrent | elapsed per batch:' "$(rget batch 0)" "$(rget peak 0)"
    b=1
    while [[ "$b" -le "$(rget batch 0)" ]]; do printf ' %s=%s' "$b" "$(elapsed "$(cat "$TASK/batches/$b/elapsed" 2>/dev/null || printf 0)")"; b=$((b + 1)); done
    printf ' | no savings claim without a serial baseline\n'
    printf 'Effort distribution (requested): cheap low %s / medium %s / high %s; expensive %s\n' "$low" "$med" "$high" "$exp"
    printf 'Escalations: effort steps %s; model steps %s%s\n' "$(grep -c "$(printf '\teffort\t')" "$TASK/ledger.tsv" || true)" "$(grep -c "$(printf '\tmodel\t')" "$TASK/ledger.tsv" || true)" \
      "$(for f in "$TASK"/evidence/*/escalation.md; do [[ -f "$f" ]] && printf ' | %s' "$f"; done)"
    printf 'Verified: criterion | result | evidence type | by | check fixed by\n'
    if [[ -s "$TASK/verified" ]]; then sed 's/^/  /' "$TASK/verified" | tr '\t' '|'; else printf '  none\n'; fi
    printf 'Check basis: %s\n' "$(if [[ -n "$soft" ]]; then printf 'passed only on a check a worker chose, which the script re-ran but cannot judge for relevance:%s. Give these criteria a check: in the plan to bind them' "$soft"; else printf 'every executed criterion passed a check fixed in the plan, or none was executed'; fi)"
    printf 'Choices: %s\n' "$(if [[ -f "$TASK/decisions.md" ]]; then tr '\n' ' ' < "$TASK/decisions.md"; else printf 'none'; fi)"
    printf 'Unresolved checks/work:'
    out=''
    for id in $(items); do
      st=$(iget "$id" status)
      case "$st" in accepted) : ;; done) [[ "$(istage "$id")" == map ]] || out="$out\n  $(iname "$id"): produced, not verified" ;;
        unresolved) out="$out\n  $(iname "$id"): $(iget "$id" stop_reason unresolved)" ;;
        *) [[ "$(istage "$id")" == verify && -n "$(rget validated '')" ]] || out="$out\n  $(iname "$id"): $st" ;; esac
    done
    if [[ -s "$TASK/unowned-fail" ]]; then out="$out$(awk -F '\t' '{ printf "\\n  %s: failed and no item owns it", $1 }' "$TASK/unowned-fail")"; fi
    if [[ -n "$out" ]]; then printf '%b\n' "$out"; else printf ' none\n'; fi
    printf 'Workspace: validated snapshot %s; changes after validation: %s; changes between batches outside any dispatch: %s; files written by the script'"'"'s check re-runs: %s\n' "$(v=$(rget validated ''); printf '%s' "${v:-none}")" "${drift:-none}" \
      "$(if [[ -s "$TASK/gap-changes" ]]; then tr '\n' ' ' < "$TASK/gap-changes"; else printf 'none'; fi)" \
      "$(if [[ -s "$TASK/check-writes" ]]; then tr '\n' ' ' < "$TASK/check-writes"; else printf 'none'; fi)"
    printf 'External actions: %s; commands the script ran itself: %s (%s/commands.log); commands it refused to run: %s%s; possibly changing commands in worker records: %s%s. The screen is a heuristic, not proof of no external change\n' "${external:-none reported}" \
      "$(if [[ -f "$TASK/commands.log" ]]; then wc -l < "$TASK/commands.log" | tr -d ' '; else printf 0; fi)" "$TASK" \
      "$refused" "$(if [[ "$refused" != 0 ]]; then printf ' (%s/refused)' "$TASK"; fi)" "$muts" "$(if [[ "$muts" != 0 ]]; then printf ' (%s/mutations)' "$TASK"; fi)"
    printf 'Not covered by snapshots: external systems, ignored files\n'
    printf 'Secrets: %s\n' "$(if [[ -n "$secrets" ]]; then printf 'DETECTED in %s. Their values are withheld from this report, the log and the briefs; do not share those files' "$secrets"; else printf 'none detected (by variable name and key pattern; not a guarantee)'; fi)"
    printf 'Usage: %s\n' "${usage_text:-unavailable}"
    printf 'Post-acceptance defects: not assessed\n'
    printf 'Run files: %s\n' "$TASK"
  } | redact > "$TASK/report.md"
  local started
  started=$(rget started "$(now)")
  say end run "$(if [[ "$state" == complete ]]; then printf done; elif [[ "$state" == INVALID* ]]; then printf 'ended: the workspace changed after validation'; else printf 'ended with open work'; fi)$(sep)$accepted/$total items accepted$(sep)$unresolved unresolved$(sep)$(elapsed $(( $(now) - started )))$(sep)peak $(rget peak 0) parallel"
  event report - "$accepted/$total accepted"
  cat "$TASK/report.md"
}

# ---- init ------------------------------------------------------------------------------------
cmd_init() {
  local host='' tier='' workspace='' kind=code coordinator=unknown plain=0 symbols='' root="${TMPDIR:-/tmp}/escalating-agents" mode cause='' v
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --host) host=${2:-}; shift 2 ;; --tier) tier=${2:-}; shift 2 ;; --workspace) workspace=${2:-}; shift 2 ;;
      --kind) kind=${2:-}; shift 2 ;; --coordinator) coordinator=${2:-}; shift 2 ;; --task-root) root=${2:-}; shift 2 ;;
      --plain) plain=1; shift ;; --ascii) symbols=ascii; shift ;; --unicode) symbols=unicode; shift ;;
      *) die "unknown option: $1" ;;
    esac
  done
  [[ -n "$host" && -n "$tier" && -n "$workspace" ]] || usage
  host_numbers "$host" "$tier"
  in_list "$kind" 'code infra data' || die "kind is code, infra or data: $kind"
  [[ -d "$workspace" ]] || die "workspace does not exist: $workspace"
  workspace=$(cd "$workspace" && pwd -P)
  if [[ -z "$symbols" ]]; then
    case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*) symbols=unicode ;; *) symbols=ascii ;; esac
  fi
  mkdir -p "$root"
  TASK=$(mktemp -d "$root/task.XXXXXX")
  TASK=$(cd "$TASK" && pwd -P)
  mkdir "$TASK/run" "$TASK/items" "$TASK/criteria" "$TASK/evidence" "$TASK/briefs" "$TASK/batches"
  mode=git
  if [[ "$plain" == 1 ]] || ! git -C "$workspace" rev-parse --show-toplevel > /dev/null 2>&1; then mode=plain; fi
  if [[ "$mode" == plain ]]; then snap init --plain "$workspace" "$TASK/state" > /dev/null
  else snap init "$workspace" "$TASK/state" > /dev/null; workspace=$(cd "$(git -C "$workspace" rev-parse --show-toplevel)" && pwd -P); fi
  snap capture "$TASK/state" base > /dev/null
  rput host "$host"; rput tier "$tier"; rput kind "$kind"; rput coordinator "$coordinator"; rput workspace "$workspace"
  rput symbols "$symbols"; rput budget "$N_BUDGET"; rput used 0; rput started "$(now)"; rput snapmode "$mode"; rput batch 0; rput cycle 0
  : > "$TASK/ledger.tsv"; : > "$TASK/log.txt"
  # Pinning preflight: settings that override a per-call model or effort request.
  rput pinning unverified
  if [[ "$host" == claude ]]; then
    # CLAUDE_CODE_SUBAGENT_MODEL alone is only a fallback below the per-call model, so it is no mismatch.
    for v in CLAUDE_CODE_EFFORT_LEVEL ANTHROPIC_DEFAULT_HAIKU_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL; do
      if [[ -n "${!v:-}" ]]; then cause="${cause:+$cause, }$v=${!v}"; fi
    done
    if [[ -n "${CLAUDE_CODE_SUBAGENT_MODEL_FORCE:-}" ]]; then
      cause="${cause:+$cause, }CLAUDE_CODE_SUBAGENT_MODEL_FORCE=$CLAUDE_CODE_SUBAGENT_MODEL_FORCE (forced model: ${CLAUDE_CODE_SUBAGENT_MODEL:-not stated})"
    fi
  fi
  printf 'TASK=%s\n' "$TASK"
  printf 'workspace %s (%s snapshots, base captured)\n' "$workspace" "$mode"
  if [[ -n "$cause" ]]; then
    rput pinning mismatch; rput pinning_cause "$cause"
    printf 'pinning: KNOWN MISMATCH — %s. Workers would not run on the requested model or effort, so dispatch is refused. Read references/pinning.md and tell the user.\n' "$cause"
  elif [[ "$host" == codex ]]; then
    printf 'pinning: requested, unverified (nothing to check from here on this host). Look at your spawn tool once: if it hides or rejects model or reasoning_effort, read references/pinning.md.\n'
  else
    printf 'pinning: requested, unverified (no override in the environment). Read references/pinning.md only if a dispatch rejects model or effort.\n'
  fi
  printf 'next: ledger.sh plan TASK with the criteria, decisions and first items\n'
}
cmd_numbers() {
  local t
  [[ -n "${1:-}" ]] || usage
  for t in A B C D; do
    host_numbers "$1" "$t"
    printf '%s tier=%s budget=%s validators=%s takes_produce=%s takes_support=%s gate_min_cheap_takes=%s continuations_per_level=%s expensive_units=%s writer_ceiling=none cheap=%s expensive=%s\n' \
      "$1" "$t" "$N_BUDGET" "$N_V" "$N_TAKES_PRODUCE" "$N_TAKES_SUPPORT" "$N_GATE_MIN" "$N_CONT" "$WEIGHT" "$N_CHEAP" "$N_EXP"
  done
  printf '%s ladder_produce=%s ladder_support=%s\n' "$1" "${LADDER_PRODUCE// /,}" "${LADDER_SUPPORT// /,}"
}

main() {
  [[ $# -gt 0 ]] || usage
  local command=$1
  shift
  case "$command" in
    init) cmd_init "$@" ;;
    plan) cmd_plan "$@" ;;
    dispatch) cmd_dispatch "$@" ;;
    defer) cmd_defer "$@" ;;
    result) cmd_result "$@" ;;
    reconcile) cmd_reconcile "$@" ;;
    scope) cmd_scope "$@" ;;
    drift) cmd_drift "$@" ;;
    gate) cmd_gate "$@" ;;
    classify) cmd_classify "$@" ;;
    answer) cmd_answer "$@" ;;
    pinning) cmd_pinning "$@" ;;
    stop) cmd_stop "$@" ;;
    promote) cmd_promote "$@" ;;
    status) cmd_status "$@" ;;
    report) cmd_report "$@" ;;
    numbers) cmd_numbers "$@" ;;
    *) usage ;;
  esac
}
# Everything the script prints passes the secret filter on its way out.
main "$@" | redact
