#!/usr/bin/env bash
# Run supabase/tests/run.sql with ON_ERROR_STOP, capturing NOTICE markers.
# Requires pipefail so a failing psql still fails the step when teeing the log
# (tee alone would otherwise mask producer exit status under bash -e).
set -euo pipefail
cd "$(dirname "$0")/.."

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
LOG_PATH="${DB_TEST_LOG:-/tmp/botore-db-tests.log}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run.sql 2>&1 | tee "$LOG_PATH"
