#!/usr/bin/env bash
# Full verification: format, lint, typecheck, unit/property/golden tests,
# boundary checks, license inventory. DB-dependent suites run separately
# via test:integration after db:reset.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> prettier check"
pnpm exec prettier --check .

echo "==> turbo lint/typecheck/test"
pnpm exec turbo run lint typecheck test

echo "==> architecture boundary check"
node scripts/check-boundaries.mjs

echo "==> secret scan"
bash scripts/scan-secrets.sh

echo "==> license inventory"
bash scripts/license-inventory.sh

echo ""
echo "verify OK"
