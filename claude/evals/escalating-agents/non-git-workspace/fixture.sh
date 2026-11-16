#!/usr/bin/env bash
# Scaffold: a plain directory, deliberately not a git repository, with two JSON sources and a named check.
set -euo pipefail
mkdir -p sources checks out
printf '[5, 3, 9, 3]\n' > sources/a.json
printf '[9, 1, 7]\n' > sources/b.json
cat > checks/verify.sh <<'SH'
#!/usr/bin/env bash
cd "$(dirname "$0")/.."
got=$(tr -d ' \n' < out/merged.json 2>/dev/null)
[ "$got" = "[1,3,5,7,9]" ] && { echo "ok: merged list is sorted and unique"; exit 0; }
echo "FAIL: out/merged.json is '$got' (expected the sorted unique union of both sources)"
exit 1
SH
chmod +x checks/verify.sh
printf '# merge\nMerge `sources/a.json` and `sources/b.json` into `out/merged.json`. `checks/verify.sh` validates the result.\n' > README.md
