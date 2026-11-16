#!/usr/bin/env bash
# Scaffold: a command dispatcher with four independent stub subcommands, one file each.
set -euo pipefail
git init -q
git config user.email eval@example.invalid
git config user.name eval
mkdir -p bin lib test
cat > bin/tool <<'SH'
#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
cmd=${1:?usage: tool <upper|reverse|count|repeat> ...}; shift
[ -f "$here/lib/$cmd.sh" ] || { echo "unknown subcommand: $cmd" >&2; exit 2; }
bash "$here/lib/$cmd.sh" "$@"
SH
for c in upper reverse count repeat; do printf '#!/usr/bin/env bash\necho "not implemented"\nexit 1\n' > "lib/$c.sh"; done
cat > test/tool.sh <<'SH'
#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
fail=0
t() { local want=$1 got; shift; got=$(bin/tool "$@" 2>&1); if [ "$got" != "$want" ]; then echo "FAIL: tool $* -> '$got' (expected '$want')"; fail=1; else echo "ok: tool $*"; fi; }
t 'HELLO' upper hello
t 'olleh' reverse hello
t '5' count hello
t 'ab ab ab' repeat 3 ab
exit $fail
SH
chmod +x bin/tool test/tool.sh
cat > README.md <<'MD'
# tool
`bin/tool <subcommand>` runs `lib/<subcommand>.sh`. Each subcommand lives in its own file. `test/tool.sh` checks all four.
MD
git add -A && git commit -qm "scaffold"
