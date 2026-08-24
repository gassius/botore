#!/usr/bin/env bash
# Resets the local database to migrations + seed state and runs DB tests.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "==> supabase db reset (drops, re-applies all migrations + seed.sql)"
pnpm exec supabase db reset --no-backup

echo "==> running database tests (supabase/tests/run.sql)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/run.sql

echo "db:reset OK — schema is at migration head with seed data."
