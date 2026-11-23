#!/usr/bin/env bash
# Full verification: format, lint, typecheck, unit/property/golden tests,
# boundary checks, license inventory. DB-dependent suites run separately
# via test:integration after db:reset.
#
# Agents MUST keep this green before every commit/push (see AGENTS.md and
# .cursor/rules/verify-before-push.mdc). Lefthook pre-push runs `pnpm verify`.
#
# Optional: VERIFY_AFFECTED=1 scopes turbo lint/typecheck/test to workspaces
# changed vs origin/main (prettier/boundaries/secrets/licenses still full-repo).
set -euo pipefail
cd "$(dirname "$0")/.."

TURBO_FILTER_ARGS=()
if [[ "${VERIFY_AFFECTED:-}" == "1" ]]; then
  echo "==> affected mode (turbo --filter=...[origin/main])"
  TURBO_FILTER_ARGS=(--filter='...[origin/main]')
fi

echo "==> prettier check"
pnpm exec prettier --check .

echo "==> turbo lint/typecheck/test"
pnpm exec turbo run lint typecheck test "${TURBO_FILTER_ARGS[@]}"

echo "==> web-preview route map unit tests"
node --test scripts/web-preview-capture/map-changed-routes.test.mjs

echo "==> architecture boundary check"
node scripts/check-boundaries.mjs

echo "==> secret scan"
bash scripts/scan-secrets.sh

echo "==> license inventory"
bash scripts/license-inventory.sh

echo ""
echo "verify OK"
