#!/usr/bin/env bash
# C7c — Ubuntu-side local Supabase + Cloudflare quick tunnel for iOS Simulator
# live-fight captures. Avoids Colima/qemu on macos-15 (starves the hosted runner).
#
# Writes artifacts/ios-live-fight-tunnel/tunnel.env for the macOS job.
# Cloudflared runs in Docker (--network host) so it survives across GHA steps.
# Optional keepalive is a separate script (ci-ios-live-fight-backend-keepalive.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

TIP_SHA="$(git rev-parse HEAD)"
ARTIFACT_DIR="${REPO_ROOT}/artifacts/ios-live-fight-tunnel"
mkdir -p "${ARTIFACT_DIR}"

echo "ci-ios-live-fight-backend: tip=${TIP_SHA:0:12}" >&2

# Exclude heavy UI/analytics containers — fight path needs Kong + GoTrue +
# PostgREST + Storage + Postgres. Edge Functions served on the host.
EXCLUDE="${CAPTURE_SUPABASE_EXCLUDE:-studio,mailpit,logflare,vector,imgproxy,postgres-meta}"

echo "starting local Supabase (exclude=${EXCLUDE})…" >&2
pnpm exec supabase start -x "${EXCLUDE}" --ignore-health-check \
  || pnpm exec supabase start -x "${EXCLUDE}" \
  || pnpm exec supabase start --ignore-health-check \
  || pnpm exec supabase start

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"

echo "db reset (migrations + seed)…" >&2
pnpm exec supabase db reset --local

eval "$(pnpm exec supabase status -o env | sed -E 's/^([A-Z0-9_]+)=/export \1=/')"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"

echo "atlas storage bootstrap…" >&2
node scripts/seed-atlas-storage.mjs

start_functions_serve() {
  {
    echo "SUPABASE_URL=${SUPABASE_URL}"
    echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
    echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  } >/tmp/botore-functions.env

  if [[ -f /tmp/botore-functions-serve.pid ]]; then
    kill "$(cat /tmp/botore-functions-serve.pid)" >/dev/null 2>&1 || true
  fi
  # nohup so a later keepalive step can reuse if this step's children are reaped.
  nohup pnpm exec supabase functions serve --env-file /tmp/botore-functions.env \
    >/tmp/botore-functions-serve.log 2>&1 &
  echo $! >/tmp/botore-functions-serve.pid
  disown || true
  if ! WAIT_EDGE_TIMEOUT_SEC=90 node scripts/wait-edge-health.mjs; then
    echo "functions serve log:" >&2
    cat /tmp/botore-functions-serve.log >&2 || true
    return 1
  fi
}

start_functions_serve

# Repair GoTrue against localhost (tunnel URL is for the Simulator only).
export CAPTURE_EMULATOR_SUPABASE_URL="${SUPABASE_URL}"
node "${SCRIPT_DIR}/prepare-live-fight-backend.mjs" --write /tmp/botore-live-fight-local.env

# Pin cloudflared (host network) — do not float on :latest (C7c PRR P2).
CLOUDFLARED_IMAGE="${CAPTURE_CLOUDFLARED_IMAGE:-cloudflare/cloudflared:2026.10.7}"
echo "starting Cloudflare quick tunnel (docker, host network, image=${CLOUDFLARED_IMAGE})…" >&2
docker rm -f botore-cf-tunnel >/dev/null 2>&1 || true
docker pull "${CLOUDFLARED_IMAGE}" >/dev/null
docker run -d --name botore-cf-tunnel --network host \
  "${CLOUDFLARED_IMAGE}" \
  tunnel --no-autoupdate --url "${SUPABASE_URL}" >/dev/null

TUNNEL_URL=""
for _ in $(seq 1 90); do
  TUNNEL_URL="$(
    docker logs botore-cf-tunnel 2>&1 \
      | grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' \
      | head -n 1 || true
  )"
  if [[ -n "${TUNNEL_URL}" ]]; then
    break
  fi
  sleep 2
done
if [[ -z "${TUNNEL_URL}" ]]; then
  echo "error: cloudflared did not print a trycloudflare.com URL" >&2
  docker logs botore-cf-tunnel >&2 || true
  exit 1
fi
# Do not print the public tunnel hostname into CI logs (public repo).
echo "tunnel ready (hostname redacted)" >&2

# Probe edge health through the tunnel (Simulator path).
probe_ok=0
for _ in $(seq 1 30); do
  if curl -fsS \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    "${TUNNEL_URL}/functions/v1/health" >/dev/null 2>&1; then
    probe_ok=1
    break
  fi
  sleep 2
done
if [[ "${probe_ok}" != "1" ]]; then
  echo "error: tunnel health probe failed" >&2
  docker logs botore-cf-tunnel >&2 || true
  cat /tmp/botore-functions-serve.log >&2 || true
  exit 1
fi

# Artifact for the macOS job: URL + anon only — never service-role (C7c PRR P2).
{
  echo "CAPTURE_REMOTE_SUPABASE=1"
  echo "CAPTURE_EMULATOR_SUPABASE_URL=${TUNNEL_URL}"
  echo "EXPO_PUBLIC_SUPABASE_URL=${TUNNEL_URL}"
  echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "SUPABASE_URL=${TUNNEL_URL}"
  echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "ANON_KEY=${SUPABASE_ANON_KEY}"
} >"${ARTIFACT_DIR}/tunnel.env"

# Persist keys for the keepalive step only (local runner disk, not artifact).
{
  echo "SUPABASE_URL=http://127.0.0.1:54321"
  echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  echo "ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  echo "TUNNEL_URL=${TUNNEL_URL}"
} >/tmp/botore-ios-backend.env

echo "wrote ${ARTIFACT_DIR}/tunnel.env" >&2
# Real redact (previous sed re-emitted the secret via &).
sed -E 's/((ANON_KEY|SUPABASE_ANON_KEY|EXPO_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_URL|CAPTURE_EMULATOR_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_URL)=).*/\1<redacted>/' \
  "${ARTIFACT_DIR}/tunnel.env" >&2 || true
echo "ci-ios-live-fight-backend: prepare done (keepalive is a separate step)" >&2
