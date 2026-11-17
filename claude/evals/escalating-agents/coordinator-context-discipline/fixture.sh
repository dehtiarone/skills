#!/usr/bin/env bash
# Scaffold: a small multi-file shell project with a bug whose cause is not in the file the symptom names.
set -euo pipefail
git init -q
git config user.email eval@example.invalid
git config user.name eval
mkdir -p bin lib data test
cat > data/sales.txt <<'TXT'
region amount
north 10
south 20
east 30
west 40
TXT
cat > lib/rows.sh <<'SH'
# rows FILE: print the data rows of FILE, without its header line.
rows() { tail -n +3 "$1"; }
SH
cat > lib/sum.sh <<'SH'
# sum: add the second column of the rows on stdin.
sum() { local total=0 name amount; while read -r name amount; do total=$((total + amount)); done; echo "$total"; }
SH
cat > lib/format.sh <<'SH'
# format LABEL VALUE: print one report line.
format() { printf '%s: %s\n' "$1" "$2"; }
SH
cat > bin/report <<'SH'
#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
. "$here/lib/rows.sh"; . "$here/lib/sum.sh"; . "$here/lib/format.sh"
format total "$(rows "$here/data/sales.txt" | sum)"
SH
cat > test/report.sh <<'SH'
#!/usr/bin/env bash
cd "$(dirname "$0")/.."
got=$(bin/report)
[ "$got" = "total: 100" ] && { echo "ok: $got"; exit 0; }
echo "FAIL: bin/report printed '$got' (expected 'total: 100')"
exit 1
SH
chmod +x bin/report test/report.sh
cat > README.md <<'MD'
# report
`bin/report` prints the total of `data/sales.txt`. `test/report.sh` checks it. Helpers live in `lib/`.
MD
git add -A && git commit -qm "scaffold"
