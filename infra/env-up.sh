#!/usr/bin/env bash
# Starts the local stack: Supabase CLI (Postgres/Auth/Storage) + app services.
# Idempotent: safe to run repeatedly.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> supabase start (first run pulls Docker images; be patient)"
pnpm exec supabase start --ignore-health-check 2>/dev/null || pnpm exec supabase start

echo "==> exporting local connection strings"
# Local Supabase Postgres (direct connection, server credential).
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
echo "DATABASE_URL=$DATABASE_URL"
echo "API:      http://127.0.0.1:8080   (pnpm --filter @botore/api dev)"
echo "Worker:   http://127.0.0.1:8081   (pnpm --filter @botore/worker dev)"
echo "Dashboard:http://127.0.0.1:3100   (pnpm --filter @botore/dashboard dev)"

cat <<'EOF'

Next steps:
  pnpm db:reset          # apply migrations + seed from scratch
  pnpm dev               # run api/worker/dashboard in dev mode
EOF
