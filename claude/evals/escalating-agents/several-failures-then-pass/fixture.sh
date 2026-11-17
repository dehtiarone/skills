#!/usr/bin/env bash
# Scaffold: a tiny shell project with a runnable check. Runs in the empty eval workspace.
set -euo pipefail
git init -q
git config user.email eval@example.invalid
git config user.name eval
mkdir -p bin test
cat > bin/greet <<'SH'
#!/usr/bin/env bash
echo "hello"
SH
cat > bin/farewell <<'SH'
#!/usr/bin/env bash
echo "bye"
SH
cat > test/run.sh <<'SH'
#!/usr/bin/env bash
# Behavioral check: runs the scripts and compares output. Exit 0 only when all expectations hold.
set -u
cd "$(dirname "$0")/.."
fail=0
expect() { local got; got=$("$@" 2>&1); if [ "$got" != "$EXPECTED" ]; then echo "FAIL: $* -> '$got' (expected '$EXPECTED')"; fail=1; else echo "ok: $*"; fi; }
EXPECTED="hello" expect bin/greet
EXPECTED="bye" expect bin/farewell
exit $fail
SH
chmod +x bin/greet bin/farewell test/run.sh
cat > README.md <<'MD'
# greeter
Run `test/run.sh` to check behaviour. Scripts live in `bin/`.
`test/` is the hidden acceptance suite: only the criterion check and validators run it.
MD
cat > test/stages.sh <<'SH'
#!/usr/bin/env bash
# Hidden acceptance check: reveals one unmet requirement at a time.
cd "$(dirname "$0")/.."
out=$(bin/greet 2>&1)
[ "$(printf '%s\n' "$out" | sed -n 1p)" = "greeter v3" ] || { echo "FAIL stage 1: the first line must be exactly: greeter v3"; exit 1; }
[ "$(printf '%s\n' "$out" | sed -n 2p)" = "hello, world" ] || { echo "FAIL stage 2: the second line must be exactly: hello, world"; exit 1; }
[ "$(printf '%s\n' "$out" | sed -n 3p)" = "-- 42 --" ] || { echo "FAIL stage 3: the third line must be exactly: -- 42 --"; exit 1; }
echo "ok: all three stages pass"
SH
chmod +x test/stages.sh
git add -A && git commit -qm "scaffold"
