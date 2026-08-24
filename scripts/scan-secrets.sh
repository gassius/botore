#!/usr/bin/env bash
# Secret scan: fails on obvious credential patterns in tracked files.
set -euo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  "service_role"
  "SUPABASE_SERVICE_ROLE_KEY=.+[^<]"
  "sk-[a-zA-Z0-9]{20,}"
  "ghp_[a-zA-Z0-9]{30,}"
  "AKIA[0-9A-Z]{16}"
  "-----BEGIN (RSA |EC )?PRIVATE KEY-----"
)

FAILED=0
while IFS= read -r file; do
  for pat in "${PATTERNS[@]}"; do
    if grep -InE "$pat" "$file" >/dev/null 2>&1; then
      echo "SECRET-LIKE MATCH in $file (pattern: $pat)"
      FAILED=1
    fi
  done
done < <(git ls-files | grep -vE '\.(lock|snap)$' | grep -v '^game-architecture-report.md$')

if [ "$FAILED" = "0" ]; then
  echo "secret scan OK"
else
  exit 1
fi
