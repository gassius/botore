#!/usr/bin/env bash
# Stops the local Supabase stack. Application services are ephemeral dev
# processes (Ctrl-C); only Supabase needs an explicit stop.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> supabase stop"
pnpm exec supabase stop || true
echo "local environment down."
