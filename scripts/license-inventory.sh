#!/usr/bin/env bash
# Third-party license inventory.
# - Runtime deps of shippable workspaces must have permissive licenses.
# - Full inventory is written to a gitignored temp file for review.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="node_modules/.license-inventory.txt"
mkdir -p node_modules

echo "package@version license" > "$OUT"
FAIL=0
while IFS= read -r row; do
  [ -z "$row" ] && continue
  echo "$row" >> "$OUT"
  lic="${row% *}"; lic="${row##* }"
  case "$lic" in
    MIT|ISC|"Apache-2.0"|BSD*|"0BSD"|CC0-1.0|"BlueOak-1.0.0"|"Python-2.0") ;;
    UNLICENSED) echo "FAIL unlicensed: $row"; FAIL=1 ;;
    *) echo "REVIEW needed: $row"; FAIL=1 ;;
  esac
done < <(node scripts/collect-licenses.cjs)

if [ "$FAIL" = "0" ]; then echo "license-inventory: OK (inventory at $OUT)"; else exit 1; fi
