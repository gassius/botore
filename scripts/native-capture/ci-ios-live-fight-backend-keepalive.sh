#!/usr/bin/env bash
# Keep Ubuntu Supabase + Cloudflare tunnel alive until iOS uploads done marker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

TIP_SHA="$(git rev-parse HEAD)"
# Scope by run attempt so a prior failed attempt's done marker (uploaded with
# if: always()) cannot stop keepalive on the next re-run of this workflow run.
RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
DONE_NAME="ios-live-fight-done-${TIP_SHA}-${RUN_ATTEMPT}"
KEEPALIVE_MIN="${CAPTURE_BACKEND_KEEPALIVE_MIN:-100}"
# Ignore done artifacts created before this keepalive started (stale same-name).
KEEPALIVE_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export KEEPALIVE_STARTED_AT

if [[ -f /tmp/botore-ios-backend.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /tmp/botore-ios-backend.env
  set +a
fi

export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${ANON_KEY:-}}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}"
TUNNEL_URL="${TUNNEL_URL:-}"

ensure_functions_serve() {
  if curl -fsS -o /dev/null \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    "${SUPABASE_URL}/functions/v1/health"; then
    return 0
  fi
  echo "functions serve down — restarting…" >&2
  {
    echo "SUPABASE_URL=${SUPABASE_URL}"
    echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
    echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
  } >/tmp/botore-functions.env
  nohup pnpm exec supabase functions serve --env-file /tmp/botore-functions.env \
    >/tmp/botore-functions-serve.log 2>&1 &
  echo $! >/tmp/botore-functions-serve.pid
  disown || true
  WAIT_EDGE_TIMEOUT_SEC=90 node scripts/wait-edge-health.mjs || {
    cat /tmp/botore-functions-serve.log >&2 || true
    return 1
  }
}

download_done() {
  if [[ -z "${GITHUB_TOKEN:-}" || -z "${GITHUB_REPOSITORY:-}" || -z "${GITHUB_RUN_ID:-}" ]]; then
    return 1
  fi
  local api="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100"
  local id
  id="$(
    curl -fsS -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" "${api}" \
      | node -e '
        let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
          try {
            const j=JSON.parse(s);
            const name=process.argv[1];
            const startedMs=Date.parse(process.env.KEEPALIVE_STARTED_AT||"")||0;
            const a=(j.artifacts||[]).find((x)=>{
              if(x.name!==name || x.expired) return false;
              const created=Date.parse(x.created_at||"")||0;
              // Allow small clock skew; reject markers from earlier attempts.
              return created + 5000 >= startedMs;
            });
            if(a) process.stdout.write(String(a.id));
          } catch {}
        });
      ' "${DONE_NAME}"
  )"
  [[ -n "${id}" ]]
}

if ! docker ps --format '{{.Names}}' | grep -qx botore-cf-tunnel; then
  echo "error: botore-cf-tunnel container not running" >&2
  docker ps -a >&2 || true
  exit 1
fi

ensure_functions_serve

echo "keepalive up to ${KEEPALIVE_MIN}m waiting for artifact ${DONE_NAME} (started ${KEEPALIVE_STARTED_AT})…" >&2
for i in $(seq 1 "${KEEPALIVE_MIN}"); do
  if download_done; then
    echo "iOS signaled done (${DONE_NAME}) after ${i}m — shutting down" >&2
    docker rm -f botore-cf-tunnel >/dev/null 2>&1 || true
    exit 0
  fi
  ensure_functions_serve || echo "warn: functions serve restart failed at minute ${i}" >&2
  if [[ -n "${TUNNEL_URL}" ]]; then
    curl -fsS -o /dev/null \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
      "${TUNNEL_URL}/functions/v1/health" \
      || echo "warn: tunnel health failed at minute ${i}" >&2
  fi
  if (( i % 5 == 0 )); then
    echo "keepalive ${i}/${KEEPALIVE_MIN}m (tunnel hostname redacted)" >&2
  fi
  sleep 60
done

echo "error: timed out waiting for ${DONE_NAME}" >&2
exit 1
