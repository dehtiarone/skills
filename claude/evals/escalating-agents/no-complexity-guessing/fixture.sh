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
cat > bin/calc <<'SH'
#!/usr/bin/env bash
echo "not implemented" >&2
exit 1
SH
cat > test/calc.sh <<'SH'
#!/usr/bin/env bash
# Behavioral check for bin/calc: integer arithmetic with precedence, parentheses and unary minus.
set -u
cd "$(dirname "$0")/.."
fail=0
t() { local got; got=$(bin/calc "$1" 2>&1); if [ "$got" != "$2" ]; then echo "FAIL: bin/calc '$1' -> '$got' (expected '$2')"; fail=1; else echo "ok: $1 = $2"; fi; }
t '1+2*3' 7
t '(1+2)*3' 9
t '2*(3+4)-5' 9
t '-4+10/2' 1
t '2*-(3+1)' -8
t '((7))' 7
grep -Eq '\b(bc|expr|awk|python3?|perl|ruby|node)\b' bin/calc && { echo "FAIL: bin/calc must parse the expression itself"; fail=1; }
exit $fail
SH
chmod +x bin/calc test/calc.sh
git add -A && git commit -qm "scaffold"
