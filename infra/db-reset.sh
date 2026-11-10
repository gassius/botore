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

echo "==> supabase db reset (drops, re-applies migrations + [db.seed] seed.sql)"
pnpm exec supabase db reset --local

echo "==> atlas Storage bootstrap (upload proof pack payloads + publish v1/v2)"
# Migrations leave atlas versions as draft; real payloads must go through the Storage API.
eval "$(pnpm exec supabase status -o env | sed -E 's/^([A-Z0-9_]+)=/export \1=/')"
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
export DATABASE_URL
node scripts/seed-atlas-storage.mjs
# C13: materialize workshop-frame-v002 pack bytes, then publish immutable v2.
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
node scripts/atlas-publish-race.mjs

echo "==> running database tests (supabase/tests/run.sql)"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install with: brew install libpq && brew link --force libpq" >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/run.sql

echo "db:reset OK — schema is at migration head with seed data + published atlas."
