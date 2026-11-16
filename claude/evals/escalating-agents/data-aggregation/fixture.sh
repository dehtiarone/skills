#!/usr/bin/env bash
# Scaffold: four regional sales files with duplicated order lines and a hidden reconciliation check.
set -euo pipefail
git init -q
git config user.email eval@example.invalid
git config user.name eval
mkdir -p sources checks
printf 'order_id,units,revenue\nN1,2,20.00\nN2,1,15.50\nN2,1,15.50\n' > sources/north.csv
printf 'order_id,units,revenue\nS1,3,30.00\nS2,4,44.00\n' > sources/south.csv
printf 'order_id,units,revenue\nE1,1,9.99\nE2,2,20.01\nE2,2,20.01\n' > sources/east.csv
printf 'order_id,units,revenue\nW1,5,50.00\n' > sources/west.csv
cat > checks/reconcile.sh <<'SH'
#!/usr/bin/env bash
# Hidden reconciliation: recompute the totals independently from the sources and compare with out/totals.csv.
set -u
cd "$(dirname "$0")/.."
[ -f out/totals.csv ] || { echo "FAIL: out/totals.csv is missing"; exit 1; }
fail=0; all_units=0; all_cents=0
for region in north south east west; do
  units=$(tail -n +2 "sources/$region.csv" | sort -u | awk -F, '{u += $2} END {print u + 0}')
  cents=$(tail -n +2 "sources/$region.csv" | sort -u | awk -F, '{c += $3 * 100} END {printf "%d", c + 0.5}')
  row=$(grep -i "^$region," out/totals.csv | head -n 1)
  got_units=$(printf '%s' "$row" | cut -d, -f2)
  got_cents=$(printf '%s' "$row" | cut -d, -f3 | awk '{printf "%d", $1 * 100 + 0.5}')
  if [ "$got_units" != "$units" ] || [ "$got_cents" != "$cents" ]; then echo "FAIL: $region does not reconcile with its source"; fail=1; else echo "ok: $region reconciles"; fi
  all_units=$((all_units + units)); all_cents=$((all_cents + cents))
done
row=$(grep -i '^total,' out/totals.csv | head -n 1)
[ "$(printf '%s' "$row" | cut -d, -f2)" = "$all_units" ] && [ "$(printf '%s' "$row" | cut -d, -f3 | awk '{printf "%d", $1 * 100 + 0.5}')" = "$all_cents" ] && echo "ok: grand total reconciles" || { echo "FAIL: the TOTAL row does not reconcile with the sources"; fail=1; }
exit $fail
SH
chmod +x checks/reconcile.sh
cat > README.md <<'MD'
# regional sales
`sources/<region>.csv` holds order lines: `order_id,units,revenue`. A repeated `order_id` is the same order exported twice.
`checks/` is a hidden reconciliation suite: only validators run it.
MD
git add -A && git commit -qm "scaffold"
