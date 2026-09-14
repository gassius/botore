#!/usr/bin/env bash
# Resets the local database to migrations + seed state and runs DB tests.
set -euo pipefail
cd "$(dirname "$0")/.."

# Homebrew libpq is keg-only; put psql on PATH when present.
if [[ -x /opt/homebrew/opt/libpq/bin/psql ]]; then
  export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
elif [[ -x /usr/local/opt/libpq/bin/psql ]]; then
  export PATH="/usr/local/opt/libpq/bin:$PATH"
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "==> supabase db reset (drops, re-applies all migrations + seed.sql)"
pnpm exec supabase db reset --local

echo "==> running database tests (supabase/tests/run.sql)"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install with: brew install libpq && brew link --force libpq" >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/run.sql

echo "db:reset OK — schema is at migration head with seed data."
