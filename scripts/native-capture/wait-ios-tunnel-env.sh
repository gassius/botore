#!/usr/bin/env bash
# Poll the current GHA run for ios-live-fight-tunnel-<sha> and extract tunnel.env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

TIP_SHA="$(git rev-parse HEAD)"
NAME="ios-live-fight-tunnel-${TIP_SHA}"
OUT_DIR="${1:-${REPO_ROOT}/artifacts/ios-live-fight-tunnel}"
TIMEOUT_MIN="${CAPTURE_TUNNEL_WAIT_MIN:-45}"
mkdir -p "${OUT_DIR}"

if [[ -z "${GITHUB_TOKEN:-}" || -z "${GITHUB_REPOSITORY:-}" || -z "${GITHUB_RUN_ID:-}" ]]; then
  echo "error: GITHUB_TOKEN / GITHUB_REPOSITORY / GITHUB_RUN_ID required" >&2
  exit 1
fi

API="https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100"
echo "waiting up to ${TIMEOUT_MIN}m for artifact ${NAME}…" >&2

for i in $(seq 1 $((TIMEOUT_MIN * 4))); do
  ART_ID="$(
    curl -fsS -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" "${API}" \
      | node -e '
        let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
          try {
            const j=JSON.parse(s);
            const a=(j.artifacts||[]).find(x=>x.name===process.argv[1] && !x.expired);
            if(a) process.stdout.write(String(a.id));
          } catch {}
        });
      ' "${NAME}"
  )"
  if [[ -n "${ART_ID}" ]]; then
    echo "found artifact id=${ART_ID}" >&2
    curl -fsSL -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ART_ID}/zip" \
      -o /tmp/botore-tunnel-art.zip
    rm -rf "${OUT_DIR:?}/"*
    unzip -o /tmp/botore-tunnel-art.zip -d "${OUT_DIR}" >/dev/null
    if [[ ! -f "${OUT_DIR}/tunnel.env" ]]; then
      # zip may nest one directory
      found="$(find "${OUT_DIR}" -name tunnel.env | head -n 1 || true)"
      if [[ -n "${found}" ]]; then
        cp "${found}" "${OUT_DIR}/tunnel.env"
      fi
    fi
    if [[ ! -f "${OUT_DIR}/tunnel.env" ]]; then
      echo "error: tunnel.env missing in artifact" >&2
      find "${OUT_DIR}" -type f >&2 || true
      exit 1
    fi
    echo "tunnel.env ready:" >&2
    # Redact long keys in log
    sed -E 's/(KEY|ANON_KEY|SERVICE_ROLE_KEY)=.{12}/&…/' "${OUT_DIR}/tunnel.env" >&2 || true
    exit 0
  fi
  if (( i % 4 == 0 )); then
    echo "still waiting for ${NAME} (${i}/$((TIMEOUT_MIN * 4)) ×15s)…" >&2
  fi
  sleep 15
done

echo "error: timed out waiting for ${NAME}" >&2
exit 1
