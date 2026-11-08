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
MD
git add -A && git commit -qm "scaffold"
