#!/usr/bin/env bash
# C3 — Android emulator live first-run fight captures against local Supabase.
#
# Starts (or reuses) local Supabase + Edge combat-v1, bakes public env into the
# release bundle (emulator → 10.0.2.2), walks Garage → Confirm → Replay → Result,
# and records fight id / server proof into the capture manifest.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

OUT_DIR="${CAPTURE_OUT_DIR:-${REPO_ROOT}/artifacts/native-captures}"
mkdir -p "${OUT_DIR}"
export CAPTURE_DEVICE="${CAPTURE_DEVICE:-pixel_6}"
PACKAGE="${CAPTURE_ANDROID_PACKAGE:-${PACKAGE_ANDROID}}"
ARCHS="${CAPTURE_RN_ARCHITECTURES:-x86_64}"

echo "ci-live-fight-android-capture: tip=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" >&2

# --- Supabase local stack -----------------------------------------------------
echo "starting local Supabase…" >&2
pnpm exec supabase start --ignore-health-check || pnpm exec supabase start

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"

echo "db reset (migrations + seed)…" >&2
pnpm exec supabase db reset --local

eval "$(pnpm exec supabase status -o env | sed -E 's/^([A-Z0-9_]+)=/export \1=/')"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"

# Health (and combat loadout/atlas pin) require a published proof pack in Storage.
# Migrations only register draft rows — same bootstrap as .github/workflows/pr.yml.
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
  echo "health probe body:" >&2
  curl -sS "${SUPABASE_URL}/functions/v1/health" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" >&2 || true
  echo >&2
  exit 1
fi

# Repair GoTrue seed + write apps/game/.env for Metro bake (emulator URL).
node "${SCRIPT_DIR}/prepare-live-fight-backend.mjs" --write "${REPO_ROOT}/apps/game/.env"

# Export baked values for Gradle/Metro env passthrough.
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

# --- Build release APK with live env inlined ---------------------------------
echo "build @botore/game workspace deps…" >&2
pnpm --filter @botore/game^... run build

echo "expo prebuild --clean (android)…" >&2
(
  cd "${REPO_ROOT}/apps/game"
  CI=1 pnpm exec expo prebuild --platform android --clean
)
if ! grep -q 'useExpoModules()' "${REPO_ROOT}/apps/game/android/settings.gradle"; then
  echo "error: settings.gradle missing useExpoModules()" >&2
  exit 1
fi
node "${SCRIPT_DIR}/patch-android-ci-signing.mjs"

echo "assembleRelease (live fight env)…" >&2
(
  cd "${REPO_ROOT}/apps/game/android"
  EXPO_PUBLIC_DESIGN_CAPTURE=1 \
    EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT=1 \
    EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=Stable \
    EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL}" \
    EXPO_PUBLIC_SUPABASE_ANON_KEY="${EXPO_PUBLIC_SUPABASE_ANON_KEY}" \
    EXPO_USE_COMMUNITY_AUTOLINKING=0 \
    ./gradlew assembleRelease \
    -PreactNativeArchitectures="${ARCHS}" \
    -Pandroid.kotlinVersion=1.9.25 \
    --no-daemon \
    --build-cache
)

APK="$(find "${REPO_ROOT}/apps/game/android/app/build/outputs/apk/release" -name '*.apk' | head -n 1 || true)"
if [[ -z "${APK}" || ! -f "${APK}" ]]; then
  echo "error: release APK not found" >&2
  exit 1
fi
echo "installing ${APK}" >&2
adb install -r "${APK}"
adb shell am force-stop "${PACKAGE}" >/dev/null 2>&1 || true
adb logcat -c >/dev/null 2>&1 || true
adb shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null

echo "waiting for ${PACKAGE} process…" >&2
booted=0
for _ in $(seq 1 60); do
  if adb shell pidof -s "${PACKAGE}" 2>/dev/null | tr -d '\r' | grep -q '[0-9]'; then
    booted=1
    break
  fi
  sleep 1
done
if [[ "${booted}" != "1" ]]; then
  echo "error: ${PACKAGE} did not start" >&2
  adb logcat -d -t 160 '*:E' >&2 || true
  exit 1
fi
# Auth hydrate + loadout against live Supabase (cleartext to 10.0.2.2).
echo "waiting for design-capture auto sign-in…" >&2
auth_ok=0
for _ in $(seq 1 "${CAPTURE_AUTH_WAIT_SEC:-45}"); do
  if adb logcat -d 2>/dev/null | tr -d '\r' | grep -Fq 'BOTORE_CAPTURE_AUTH_OK:'; then
    auth_ok=1
    break
  fi
  if adb logcat -d 2>/dev/null | tr -d '\r' | grep -Fq 'BOTORE_CAPTURE_AUTH_ERROR:'; then
    break
  fi
  sleep 1
done
if [[ "${auth_ok}" != "1" ]]; then
  echo "error: design-capture auto sign-in did not succeed" >&2
  adb logcat -d -t 250 '*:I' | grep -E 'BOTORE_CAPTURE|Supabase|Auth|ReactNativeJS|ERROR' >&2 || true
  exit 1
fi
# Extra settle for loadout hydrate after password grant.
sleep "${CAPTURE_BOOT_SEC:-8}"
android_assert_app_foreground "${PACKAGE}"

TIP_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
MANIFEST="${OUT_DIR}/manifest-live-fight-$(stamp).txt"
: >"${MANIFEST}"
write_manifest_line "${MANIFEST}" tip_sha "${TIP_SHA}"
write_manifest_line "${MANIFEST}" commit "${COMMIT}"
write_manifest_line "${MANIFEST}" platform android
write_manifest_line "${MANIFEST}" device "${CAPTURE_DEVICE}"
write_manifest_line "${MANIFEST}" design_capture "native-phone-live-fight"
write_manifest_line "${MANIFEST}" web_preview "not-accepted"
write_manifest_line "${MANIFEST}" supabase_host "${SUPABASE_URL}"
write_manifest_line "${MANIFEST}" supabase_emulator_url "${EXPO_PUBLIC_SUPABASE_URL}"

capture_named() {
  local route="$1"
  local label="$2"
  local settle="${3:-4}"
  CAPTURE_SETTLE_SEC="${settle}" \
    "${SCRIPT_DIR}/android-screencap.sh" \
    --out "${OUT_DIR}" \
    --route "${route}" \
    --name "${label}" >/dev/null
  local matches=( "${OUT_DIR}"/android-*-"${label}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing PNG for ${label}" >&2
    return 1
  fi
  write_manifest_line "${MANIFEST}" "still.android.${label}" "${matches[0]}"
  echo "ok: ${matches[0]}" >&2
}

# 1) Garage (Stable equipped loadout)
capture_named Stable garage 5

# 2) Confirm — both bots (orchestrator selects opponent)
capture_named ConfirmFight confirm 8

# 3) Replay mid-impact — starts combat-v1 then holds impact frame
capture_named Replay replay-impact 14

# Pull fight proof from logcat (written by useDesignCaptureLiveFight).
FIGHT_LINE="$(adb logcat -d 2>/dev/null | tr -d '\r' | grep -F 'BOTORE_CAPTURE_FIGHT_JSON:' | tail -n 1 || true)"
if [[ -z "${FIGHT_LINE}" ]]; then
  echo "error: no BOTORE_CAPTURE_FIGHT_JSON in logcat — live fight did not confirm" >&2
  adb logcat -d -t 200 '*:I' | grep -E 'BOTORE_CAPTURE|combat|Fight|ERROR' >&2 || true
  ls -la "${OUT_DIR}" >&2 || true
  exit 1
fi
FIGHT_JSON="${FIGHT_LINE#*BOTORE_CAPTURE_FIGHT_JSON:}"
write_manifest_line "${MANIFEST}" fight_proof_json "${FIGHT_JSON}"
BATTLE_ID="$(node -e "const j=JSON.parse(process.argv[1]); if(!j.battleId||!j.serverConfirmed) process.exit(2); console.log(j.battleId)" "${FIGHT_JSON}")"
CHECKSUM="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.replayChecksum||'')" "${FIGHT_JSON}")"
XP="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.xpAwarded))" "${FIGHT_JSON}")"
write_manifest_line "${MANIFEST}" fight_id "${BATTLE_ID}"
write_manifest_line "${MANIFEST}" replay_checksum "${CHECKSUM}"
write_manifest_line "${MANIFEST}" xp_awarded "${XP}"
write_manifest_line "${MANIFEST}" server_confirmed "true"
echo "fight proof: battleId=${BATTLE_ID} xp=${XP}" >&2

# 4) Result — backend XP / allowances
capture_named FightResult result 5

# Assert all four stills exist (if-no-files-found equivalent).
missing=0
for label in garage confirm replay-impact result; do
  matches=( "${OUT_DIR}"/android-*-"${label}".png )
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
echo "ci-live-fight-android-capture: done → ${OUT_DIR}" >&2
