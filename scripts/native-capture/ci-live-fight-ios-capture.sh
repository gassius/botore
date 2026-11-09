#!/usr/bin/env bash
# C7c — iOS Simulator live first-run fight captures against local Supabase.
#
# Mirrors ci-live-fight-android-capture.sh: real combat-v1 fight, replay impact
# + result stills, fight proof in Documents (no faked markers, no table grants).
# Starts Colima when Docker is unavailable (macos-15 GHA).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

OUT_DIR="${CAPTURE_OUT_DIR:-${REPO_ROOT}/artifacts/native-captures}"
mkdir -p "${OUT_DIR}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"
DEVICE_CANDIDATES="${CAPTURE_IOS_DEVICE:-iPhone 16,iPhone 16 Plus,iPhone 15,iPhone 15 Pro,iPhone 14}"

echo "ci-live-fight-ios-capture: tip=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" >&2

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    echo "docker ok" >&2
    return 0
  fi
  echo "docker unavailable — installing/starting Colima…" >&2
  if ! command -v colima >/dev/null 2>&1; then
    brew install docker colima docker-compose || true
  fi
  colima start --cpu "${COLIMA_CPU:-4}" --memory "${COLIMA_MEMORY_GB:-8}" --disk "${COLIMA_DISK_GB:-60}" || \
    colima start
  # Wait for docker.
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then
      echo "colima docker ready" >&2
      return 0
    fi
    sleep 2
  done
  echo "error: docker still unavailable after Colima start" >&2
  return 1
}

ensure_docker

echo "starting local Supabase…" >&2
pnpm exec supabase start --ignore-health-check || pnpm exec supabase start

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"

echo "db reset (migrations + seed)…" >&2
pnpm exec supabase db reset --local

eval "$(pnpm exec supabase status -o env | sed -E 's/^([A-Z0-9_]+)=/export \1=/')"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"

echo "atlas storage bootstrap…" >&2
node scripts/seed-atlas-storage.mjs

{
  echo "SUPABASE_URL=${SUPABASE_URL}"
  echo "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"
  echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}"
} >/tmp/botore-functions.env

if [[ -f /tmp/botore-functions-serve.pid ]]; then
  kill "$(cat /tmp/botore-functions-serve.pid)" >/dev/null 2>&1 || true
fi
pnpm exec supabase functions serve --env-file /tmp/botore-functions.env >/tmp/botore-functions-serve.log 2>&1 &
echo $! >/tmp/botore-functions-serve.pid
if ! WAIT_EDGE_TIMEOUT_SEC=90 node scripts/wait-edge-health.mjs; then
  echo "functions serve log:" >&2
  cat /tmp/botore-functions-serve.log >&2 || true
  exit 1
fi

# iOS Simulator reaches host loopback directly.
export CAPTURE_EMULATOR_SUPABASE_URL="${CAPTURE_EMULATOR_SUPABASE_URL:-http://127.0.0.1:54321}"
node "${SCRIPT_DIR}/prepare-live-fight-backend.mjs" --write "${REPO_ROOT}/apps/game/.env"

while IFS= read -r line || [[ -n "${line}" ]]; do
  case "${line}" in
    EXPO_PUBLIC_*=*)
      export "${line?}"
      ;;
  esac
done <"${REPO_ROOT}/apps/game/.env"

export EXPO_PUBLIC_DESIGN_CAPTURE=1
export EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT=1
export EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=Stable
export EXPO_USE_COMMUNITY_AUTOLINKING=0

if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" || -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "error: live fight .env missing EXPO_PUBLIC_SUPABASE_*" >&2
  cat "${REPO_ROOT}/apps/game/.env" >&2 || true
  exit 1
fi

echo "build @botore/game workspace deps…" >&2
pnpm --filter @botore/game^... run build

if [[ "${CAPTURE_IOS_SKIP_PREBUILD:-0}" != "1" && "${CAPTURE_IOS_SKIP_PREBUILD:-0}" != "true" ]]; then
  echo "expo prebuild --clean (ios)…" >&2
  (
    cd "${REPO_ROOT}/apps/game"
    CI=1 pnpm exec expo prebuild --platform ios --clean
  )
fi

IOS_DIR="${REPO_ROOT}/apps/game/ios"
if [[ ! -d "${IOS_DIR}" ]]; then
  echo "error: apps/game/ios missing" >&2
  exit 1
fi
node "${SCRIPT_DIR}/patch-ios-ci-ats.mjs"

if [[ -f "${IOS_DIR}/Podfile" ]] && command -v pod >/dev/null 2>&1; then
  (
    cd "${IOS_DIR}"
    pod install --deployment 2>/dev/null || pod install
  )
fi

# Reuse device boot + xcodebuild path from design-capture by exporting flags and
# invoking the shared build/install portion via ci-ios with live-fight env.
export CAPTURE_IOS_SKIP_PREBUILD=1
export CAPTURE_COLD_START="${CAPTURE_COLD_START:-1}"
export CAPTURE_ROUTES="${CAPTURE_ROUTES:-}"
export CAPTURE_LIVE_FIGHT_IOS=1

# --- device + build (inline, mirrors ci-ios-simulator-capture) -----------------
require_cmd xcrun
require_cmd xcodebuild

WORKSPACE="$(find "${IOS_DIR}" -maxdepth 1 -name '*.xcworkspace' ! -name 'Pods.xcworkspace' | head -n 1 || true)"
if [[ -z "${WORKSPACE}" || ! -d "${WORKSPACE}" ]]; then
  echo "error: no app *.xcworkspace under apps/game/ios" >&2
  exit 1
fi
SCHEME="${CAPTURE_IOS_SCHEME:-BotoreGameClient}"
SCHEME_LIST="$(
  xcodebuild -list -workspace "${WORKSPACE}" 2>/dev/null \
    | awk '/Schemes:/{f=1;next} /^$/{f=0} f&&NF{gsub(/^[[:space:]]+|[[:space:]]+$/,""); print}'
)"
if ! echo "${SCHEME_LIST}" | grep -qx "${SCHEME}"; then
  if echo "${SCHEME_LIST}" | grep -qx 'BotoreGameClient'; then
    SCHEME='BotoreGameClient'
  else
    SCHEME="$(echo "${SCHEME_LIST}" | head -n 1)"
  fi
fi
echo "using scheme=${SCHEME}" >&2

pick_ios_device() {
  local available
  available="$(xcrun simctl list devices available 2>/dev/null || true)"
  IFS=',' read -r -a CANDS <<<"${DEVICE_CANDIDATES}"
  local cand
  for cand in "${CANDS[@]}"; do
    cand="$(echo "${cand}" | xargs)"
    [[ -z "${cand}" ]] && continue
    if echo "${available}" | grep -F "${cand} (" >/dev/null 2>&1; then
      printf '%s' "${cand}"
      return 0
    fi
  done
  return 1
}

DEVICE_NAME="$(pick_ios_device || true)"
if [[ -z "${DEVICE_NAME}" ]]; then
  echo "error: no phone-size iPhone Simulator device available" >&2
  exit 1
fi
export CAPTURE_DEVICE="${CAPTURE_DEVICE:-${DEVICE_NAME}}"
open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "${DEVICE_NAME}" >/dev/null 2>&1 || true
for _ in $(seq 1 60); do
  if xcrun simctl list devices | grep -F "${DEVICE_NAME} (" | grep -F '(Booted)' >/dev/null; then
    break
  fi
  xcrun simctl boot "${DEVICE_NAME}" >/dev/null 2>&1 || true
  sleep 2
done
UDID="$(xcrun simctl list devices | grep -F "${DEVICE_NAME} (" | grep -F '(Booted)' | sed -E 's/.*\(([A-F0-9-]{36})\).*/\1/' | head -n 1)"
export CAPTURE_IOS_UDID="${UDID}"
xcrun simctl bootstatus "${UDID}" -b >/dev/null 2>&1 || true

DERIVED="${IOS_DIR}/DerivedData"
PRODUCTS_DIR="${DERIVED}/Build/Products/Release-iphonesimulator"
# Keep DerivedData when restored from cache; only nuke if forced.
if [[ "${CAPTURE_IOS_CLEAN_DERIVED:-0}" == "1" ]]; then
  rm -rf "${DERIVED}"
fi
mkdir -p "${IOS_DIR}/build"

echo "xcodebuild Release (live-fight env)…" >&2
(
  cd "${IOS_DIR}"
  export RCT_NO_LAUNCH_PACKAGER=1
  export EXPO_PUBLIC_DESIGN_CAPTURE=1
  export EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT=1
  export EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=Stable
  export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL}"
  export EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY}"
  export EXPO_USE_COMMUNITY_AUTOLINKING=0
  export NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
  xcodebuild \
    -workspace "$(basename "${WORKSPACE}")" \
    -scheme "${SCHEME}" \
    -configuration Release \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=${UDID}" \
    -derivedDataPath "${DERIVED}" \
    CODE_SIGNING_ALLOWED=NO \
    ONLY_ACTIVE_ARCH=YES \
    build
)

APP="${PRODUCTS_DIR}/${SCHEME}.app"
if [[ ! -d "${APP}" ]]; then
  APP="$(find "${DERIVED}" -path '*/Release-iphonesimulator/*.app' -type d 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "${APP}" || ! -d "${APP}" ]]; then
  echo "error: Release-iphonesimulator .app not found" >&2
  exit 1
fi

xcrun simctl uninstall "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl install "${UDID}" "${APP}"

# Cold-start splash→title (budgeted) before live-fight stills.
if [[ "${CAPTURE_COLD_START:-1}" == "1" || "${CAPTURE_COLD_START:-1}" == "true" ]]; then
  COLD_BUDGET="${CAPTURE_COLD_START_BUDGET_SEC:-120}"
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout "${COLD_BUDGET}" "${SCRIPT_DIR}/ios-cold-start-capture.sh" \
      --out "${OUT_DIR}" --udid "${UDID}" --seconds "${CAPTURE_COLD_START_SEC:-8}"
  else
    "${SCRIPT_DIR}/ios-cold-start-capture.sh" \
      --out "${OUT_DIR}" --udid "${UDID}" --seconds "${CAPTURE_COLD_START_SEC:-8}"
  fi
  set -e
  node "${SCRIPT_DIR}/assert-cold-start-transition.mjs" --platform ios --out "${OUT_DIR}" || \
    echo "warn: cold-start assert failed" >&2
fi

# Remove cold-start hold-title so live-fight can auto sign-in.
DATA_DIR="$(xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
if [[ -n "${DATA_DIR}" ]]; then
  rm -f "${DATA_DIR}/Documents/botore-cold-start-intent.json" || true
fi

TIP_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
MANIFEST="${OUT_DIR}/manifest-live-fight-$(stamp).txt"
: >"${MANIFEST}"
write_manifest_line "${MANIFEST}" tip_sha "${TIP_SHA}"
write_manifest_line "${MANIFEST}" commit "${COMMIT}"
write_manifest_line "${MANIFEST}" platform ios
write_manifest_line "${MANIFEST}" device "${CAPTURE_DEVICE}"
write_manifest_line "${MANIFEST}" design_capture "native-phone-live-fight"
write_manifest_line "${MANIFEST}" web_preview "not-accepted"
write_manifest_line "${MANIFEST}" supabase_host "${SUPABASE_URL}"
write_manifest_line "${MANIFEST}" supabase_simulator_url "${EXPO_PUBLIC_SUPABASE_URL}"

capture_named() {
  local route="$1"
  local label="$2"
  local settle="${3:-5}"
  CAPTURE_SETTLE_SEC="${settle}" \
    CAPTURE_IOS_COLD_SEC="${CAPTURE_IOS_COLD_SEC:-16}" \
    "${SCRIPT_DIR}/ios-screencap.sh" \
    --out "${OUT_DIR}" \
    --udid "${UDID}" \
    --route "${route}" \
    --name "${label}" >/dev/null
  local matches=( "${OUT_DIR}"/ios-*-"${label}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing PNG for ${label}" >&2
    return 1
  fi
  write_manifest_line "${MANIFEST}" "still.ios.${label}" "${matches[0]}"
  echo "ok: ${matches[0]}" >&2
}

capture_named Stable garage 5
capture_named ConfirmFight confirm 8
capture_named Replay replay-impact 14

# Read fight proof from Documents (primary) or OSLog (fallback).
FIGHT_JSON=""
FIGHT_WAIT_SEC="${CAPTURE_FIGHT_WAIT_SEC:-90}"
FIGHT_DEADLINE=$((SECONDS + FIGHT_WAIT_SEC))
while (( SECONDS < FIGHT_DEADLINE )); do
  DATA_DIR="$(xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
  if [[ -n "${DATA_DIR}" && -f "${DATA_DIR}/Documents/botore-capture-fight-proof.json" ]]; then
    FIGHT_JSON="$(cat "${DATA_DIR}/Documents/botore-capture-fight-proof.json")"
    break
  fi
  sleep 2
done

if [[ -z "${FIGHT_JSON}" ]]; then
  echo "error: no botore-capture-fight-proof.json after ${FIGHT_WAIT_SEC}s — live fight did not confirm" >&2
  xcrun simctl spawn "${UDID}" log show --last 3m --style compact 2>/dev/null | grep -E 'BOTORE_CAPTURE|ERROR' | tail -n 80 >&2 || true
  exit 1
fi

write_manifest_line "${MANIFEST}" fight_proof_json "${FIGHT_JSON}"
BATTLE_ID="$(node -e "const j=JSON.parse(process.argv[1]); if(!j.battleId||!j.serverConfirmed) process.exit(2); console.log(j.battleId)" "${FIGHT_JSON}")"
CHECKSUM="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.replayChecksum||'')" "${FIGHT_JSON}")"
XP="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.xpAwarded))" "${FIGHT_JSON}")"
write_manifest_line "${MANIFEST}" fight_id "${BATTLE_ID}"
write_manifest_line "${MANIFEST}" replay_checksum "${CHECKSUM}"
write_manifest_line "${MANIFEST}" xp_awarded "${XP}"
write_manifest_line "${MANIFEST}" server_confirmed "true"
echo "fight proof: battleId=${BATTLE_ID} xp=${XP}" >&2

capture_named FightResult result 5

missing=0
for label in garage confirm replay-impact result; do
  matches=( "${OUT_DIR}"/ios-*-"${label}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing capture PNG ${label}" >&2
    missing=1
  fi
done
if [[ "${missing}" != "0" ]]; then
  ls -la "${OUT_DIR}" >&2 || true
  exit 1
fi

echo "manifest: ${MANIFEST}" >&2
echo "ci-live-fight-ios-capture: done → ${OUT_DIR}" >&2
