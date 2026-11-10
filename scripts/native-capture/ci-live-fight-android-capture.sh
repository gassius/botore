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
# C4: live-fight path records a short replay FX clip by default (stills still required).
# Workflow CAPTURE_CLIPS can still override to false.
export CAPTURE_CLIPS="${CAPTURE_CLIPS:-true}"

export_sentry_skip_upload_for_capture

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
    -x lintVitalRelease \
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

# C7c: real cold-start splash→title before live-fight stills (budgeted).
if [[ "${CAPTURE_COLD_START:-0}" == "1" || "${CAPTURE_COLD_START:-0}" == "true" ]]; then
  echo "cold-start splash→title capture…" >&2
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout "${CAPTURE_COLD_START_BUDGET_SEC:-120}" \
      "${SCRIPT_DIR}/android-cold-start-capture.sh" \
      --out "${OUT_DIR}" \
      --seconds "${CAPTURE_COLD_START_SEC:-8}"
  else
    "${SCRIPT_DIR}/android-cold-start-capture.sh" \
      --out "${OUT_DIR}" \
      --seconds "${CAPTURE_COLD_START_SEC:-8}"
  fi
  cold_rc=$?
  set -e
  if [[ "${cold_rc}" -ne 0 ]]; then
    echo "error: android cold-start exited ${cold_rc}" >&2
    exit "${cold_rc}"
  fi
  # Splash logo covers most of the framebuffer; default min graphite is 12%.
  node "${SCRIPT_DIR}/assert-cold-start-transition.mjs" \
    --platform android \
    --out "${OUT_DIR}" \
    --min-graphite "${CAPTURE_COLD_MIN_GRAPHITE:-0.12}"
  # Clear hold-title marker so live-fight auto sign-in can proceed.
  adb shell "run-as ${PACKAGE} rm -f files/botore-cold-start-intent.json" >/dev/null 2>&1 || true
fi

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
  local ranking="${4:-}"
  local args=(
    --out "${OUT_DIR}"
    --route "${route}"
    --name "${label}"
  )
  if [[ -n "${ranking}" ]]; then
    args+=(--ranking "${ranking}")
  fi
  CAPTURE_SETTLE_SEC="${settle}" \
    "${SCRIPT_DIR}/android-screencap.sh" \
    "${args[@]}" >/dev/null
  local matches=( "${OUT_DIR}"/android-*-"${label}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing PNG for ${label}" >&2
    return 1
  fi
  write_manifest_line "${MANIFEST}" "still.android.${label}" "${matches[0]}"
  echo "ok: ${matches[0]}" >&2
}

# Screenshot current frame without re-deep-linking (C4 FX holds).
capture_current() {
  local label="$1"
  "${SCRIPT_DIR}/android-screencap.sh" \
    --out "${OUT_DIR}" \
    --name "${label}" >/dev/null
  local matches=( "${OUT_DIR}"/android-*-"${label}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing PNG for ${label}" >&2
    return 1
  fi
  write_manifest_line "${MANIFEST}" "still.android.${label}" "${matches[0]}"
  echo "ok: ${matches[0]}" >&2
}

wait_logcat_marker() {
  local marker="$1"
  local timeout_sec="${2:-90}"
  local deadline=$((SECONDS + timeout_sec))
  local line=""
  while (( SECONDS < deadline )); do
    line="$(adb logcat -d 2>/dev/null | tr -d '\r' | grep -F "${marker}" | tail -n 1 || true)"
    if [[ -n "${line}" ]]; then
      printf '%s\n' "${line}"
      return 0
    fi
    sleep 1
  done
  return 1
}

# 1) Garage (Stable equipped loadout)
capture_named Stable garage 5

# 2) Confirm — both bots (orchestrator selects opponent)
capture_named ConfirmFight confirm 8

# 3) Replay — live-capture starts paused (~3s idle) so replay-start is NOT the
# first hit-hold frame. Settle must stay below FX_CAPTURE_IDLE_BEFORE_PLAY_MS.
# Then poll fight proof + arena/FX markers; stills land while FX peak is frozen.
capture_named Replay replay-start 2

FIGHT_LINE=""
FIGHT_JSON=""
FX_HIT="0"
FX_DODGE="0"
FX_DEFEAT="0"
GOT_ARENA=0
GOT_HIT=0
GOT_DODGE=0
GOT_DEFEAT=0
FIGHT_WAIT_SEC="${CAPTURE_FIGHT_WAIT_SEC:-120}"
FX_DEADLINE=$((SECONDS + FIGHT_WAIT_SEC))

logcat_dump() {
  adb logcat -d 2>/dev/null | tr -d '\r' || true
}

# Pipe logcat → grep (never printf a multi-MB DUMP into argv — ARG_MAX false-negatives).
logcat_has() {
  logcat_dump | grep -aFq "$1"
}

ensure_arena_layers_still() {
  if [[ "${GOT_ARENA}" -eq 1 ]]; then
    return 0
  fi
  echo "capturing arena-layers…" >&2
  capture_current arena-layers
  GOT_ARENA=1
}

# Prefer capturing before RESUME while the player is paused on the FX cue.
capture_fx_while_held() {
  local family="$1"
  local label="$2"
  local hold_marker="BOTORE_CAPTURE_FX_HOLD:family=${family}"
  local resume_marker="BOTORE_CAPTURE_FX_RESUME:family=${family}"
  echo "capturing ${label} during FX hold…" >&2
  # Soft fail if the hold window already closed (late still is still evidence).
  if logcat_has "${resume_marker}"; then
    echo "note: ${family} resume already logged — capturing late frame" >&2
  fi
  # HOLD is logged after a short settle so the frozen peak FX frame is painted.
  sleep 0.35
  capture_current "${label}"
  # Repair Yard is on-screen during FX holds — grab arena here so we do not
  # depend solely on a separate ARENA_READY poll (missed on tip 564718f).
  ensure_arena_layers_still
  if [[ "${family}" == "hit" ]]; then
    local hits=( "${OUT_DIR}"/android-*-"${label}".png )
    if [[ -e "${hits[0]:-}" ]]; then
      local impact_copy="${OUT_DIR}/android-$(stamp)-replay-impact.png"
      cp "${hits[0]}" "${impact_copy}"
      write_manifest_line "${MANIFEST}" "still.android.replay-impact" "${impact_copy}"
    fi
  fi
  # Nudge past the hold so the next family can fire (hold is ~8s; don't busy-wait adb).
  if ! logcat_has "${resume_marker}"; then
    echo "waiting briefly for ${hold_marker} resume…" >&2
    sleep 1
  fi
}

while (( SECONDS < FX_DEADLINE )); do
  if [[ -z "${FIGHT_JSON}" ]]; then
    FIGHT_LINE="$(logcat_dump | grep -aF 'BOTORE_CAPTURE_FIGHT_JSON:' | tail -n 1 || true)"
    if [[ -n "${FIGHT_LINE}" ]]; then
      FIGHT_JSON="${FIGHT_LINE#*BOTORE_CAPTURE_FIGHT_JSON:}"
      write_manifest_line "${MANIFEST}" fight_proof_json "${FIGHT_JSON}"
      BATTLE_ID="$(node -e "const j=JSON.parse(process.argv[1]); if(!j.battleId||!j.serverConfirmed) process.exit(2); console.log(j.battleId)" "${FIGHT_JSON}")"
      CHECKSUM="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.replayChecksum||'')" "${FIGHT_JSON}")"
      XP="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.xpAwarded))" "${FIGHT_JSON}")"
      FX_HIT="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String((j.fxEvents&&j.fxEvents.hit)||0))" "${FIGHT_JSON}")"
      FX_DODGE="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String((j.fxEvents&&j.fxEvents.dodge)||0))" "${FIGHT_JSON}")"
      FX_DEFEAT="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String((j.fxEvents&&j.fxEvents.defeat)||0))" "${FIGHT_JSON}")"
      write_manifest_line "${MANIFEST}" fight_id "${BATTLE_ID}"
      write_manifest_line "${MANIFEST}" replay_checksum "${CHECKSUM}"
      write_manifest_line "${MANIFEST}" xp_awarded "${XP}"
      write_manifest_line "${MANIFEST}" server_confirmed "true"
      write_manifest_line "${MANIFEST}" fx_events_hit "${FX_HIT}"
      write_manifest_line "${MANIFEST}" fx_events_dodge "${FX_DODGE}"
      write_manifest_line "${MANIFEST}" fx_events_defeat "${FX_DEFEAT}"
      echo "fight proof: battleId=${BATTLE_ID} xp=${XP} fx hit=${FX_HIT} dodge=${FX_DODGE} defeat=${FX_DEFEAT}" >&2
      if [[ "${FX_HIT}" -lt 1 || "${FX_DEFEAT}" -lt 1 ]]; then
        echo "error: sealed replay missing required FX events (hit=${FX_HIT} defeat=${FX_DEFEAT})" >&2
        exit 1
      fi
    fi
  fi

  if logcat_has 'BOTORE_CAPTURE_HYDRATE_ERROR:'; then
    echo "error: loadout hydrate failed — see BOTORE_CAPTURE_HYDRATE_ERROR in logcat" >&2
    logcat_dump | grep -aE 'BOTORE_CAPTURE_' >&2 || true
    exit 1
  fi

  # Stills only during FX holds — never concurrent adb screenrecord (deadlocks screencap).
  if [[ "${GOT_ARENA}" -eq 0 ]] && logcat_has 'BOTORE_CAPTURE_ARENA_READY:'; then
    ensure_arena_layers_still
  fi

  if [[ "${GOT_HIT}" -eq 0 ]] && logcat_has 'BOTORE_CAPTURE_FX_HOLD:family=hit'; then
    capture_fx_while_held hit replay-fx-hit
    GOT_HIT=1
  fi
  if [[ "${GOT_DODGE}" -eq 0 ]] && logcat_has 'BOTORE_CAPTURE_FX_HOLD:family=dodge'; then
    capture_fx_while_held dodge replay-fx-dodge
    GOT_DODGE=1
  fi
  if [[ "${GOT_DEFEAT}" -eq 0 ]] && logcat_has 'BOTORE_CAPTURE_FX_HOLD:family=defeat'; then
    capture_fx_while_held defeat replay-fx-defeat
    GOT_DEFEAT=1
  fi

  # Done when fight proof + arena + required FX stills are in.
  if [[ -n "${FIGHT_JSON}" && "${GOT_ARENA}" -eq 1 && "${GOT_HIT}" -eq 1 && "${GOT_DEFEAT}" -eq 1 ]]; then
    if [[ "${FX_DODGE}" -eq 0 || "${GOT_DODGE}" -eq 1 ]]; then
      break
    fi
  fi
  sleep 0.5
done

if [[ -z "${FIGHT_JSON}" ]]; then
  echo "error: no BOTORE_CAPTURE_FIGHT_JSON in logcat after ${FIGHT_WAIT_SEC}s — live fight did not confirm" >&2
  logcat_dump | grep -aE 'BOTORE_CAPTURE_|combat|Fight|permission denied|ERROR' >&2 || true
  ls -la "${OUT_DIR}" >&2 || true
  exit 1
fi

# Last-chance arena still (replay stage still up before Result deep-link).
if [[ "${GOT_ARENA}" -eq 0 ]]; then
  echo "note: arena-layers not captured during holds — taking late still" >&2
  ensure_arena_layers_still
fi

if [[ "${FX_DODGE}" -eq 0 ]]; then
  write_manifest_line "${MANIFEST}" fx_dodge "absent-from-recorded-events"
  echo "note: no dodge in sealed replay — dodge FX correctly not invented" >&2
fi

# Optional clip AFTER stills only (serial adb). Bound with timeout so a wedged
# screenrecord cannot hang the job past the hold/stills phase.
if [[ "${CAPTURE_CLIPS:-false}" == "true" || "${CAPTURE_CLIPS:-0}" == "1" ]]; then
  echo "recording post-stills replay FX clip…" >&2
  CLIP_SEC="${CAPTURE_FX_CLIP_SEC:-8}"
  CLIP_TIMEOUT=$((CLIP_SEC + 15))
  set +e
  timeout "${CLIP_TIMEOUT}" env CAPTURE_SECONDS="${CLIP_SEC}" \
    "${SCRIPT_DIR}/android-screenrecord.sh" \
    --out "${OUT_DIR}" \
    --name "replay-fx" >/tmp/botore-replay-fx-clip.path 2>/tmp/botore-replay-fx-clip.err
  clip_rc=$?
  set -e
  if [[ "${clip_rc}" -eq 0 ]]; then
    clip_matches=( "${OUT_DIR}"/android-*-replay-fx.mp4 )
    if [[ -e "${clip_matches[0]:-}" ]]; then
      write_manifest_line "${MANIFEST}" "clip.android.replay-fx" "${clip_matches[0]}"
      echo "ok: ${clip_matches[0]}" >&2
    fi
  else
    echo "note: replay-fx clip skipped (rc=${clip_rc}); stills remain required" >&2
    cat /tmp/botore-replay-fx-clip.err >&2 || true
  fi
fi

# 4) Result — backend XP / allowances (after server confirm so UI can show XP)
capture_named FightResult result 5

# 5) C5 Ranking — live board (list_ranking + seed peers + fight XP), empty, error
capture_named Ranking ranking-live 6 live
capture_named Ranking ranking-empty 4 empty
capture_named Ranking ranking-error 4 error

# 6) C8 fail-closed blocked UI evidence (design-capture failClosed deep link).
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Stable \
  --name playable-misconfigured \
  --fail-closed >/dev/null
fail_closed_matches=( "${OUT_DIR}"/android-*-playable-misconfigured.png )
if [[ -e "${fail_closed_matches[0]:-}" ]]; then
  write_manifest_line "${MANIFEST}" "still.android.playable-misconfigured" "${fail_closed_matches[0]}"
  write_manifest_line "${MANIFEST}" "c8_fail_closed" "design-capture-failClosed-deep-link"
  echo "ok: ${fail_closed_matches[0]}" >&2
else
  echo "error: missing playable-misconfigured PNG" >&2
  missing=1
fi

# Assert required stills exist (if-no-files-found equivalent).
missing="${missing:-0}"
required_labels=(
  garage
  confirm
  arena-layers
  replay-fx-hit
  replay-fx-defeat
  result
  ranking-live
  ranking-empty
  ranking-error
  playable-misconfigured
)
if [[ "${FX_DODGE}" -ge 1 ]]; then
  required_labels+=(replay-fx-dodge)
fi
for label in "${required_labels[@]}"; do
  matches=( "${OUT_DIR}"/android-*-"${label}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing capture PNG ${label}" >&2
    missing=1
  fi
done

# Hit still must differ from idle replay-start (guards start≡first-hit-hold).
start_matches=( "${OUT_DIR}"/android-*-replay-start.png )
hit_matches=( "${OUT_DIR}"/android-*-replay-fx-hit.png )
if [[ -e "${start_matches[0]:-}" && -e "${hit_matches[0]:-}" ]]; then
  if cmp -s "${start_matches[0]}" "${hit_matches[0]}"; then
    echo "error: replay-fx-hit is byte-identical to replay-start (hit spark not captured)" >&2
    missing=1
  else
    echo "ok: replay-fx-hit differs from replay-start" >&2
  fi
fi

if [[ "${missing}" != "0" ]]; then
  ls -la "${OUT_DIR}" >&2 || true
  logcat_dump | grep -aE 'BOTORE_CAPTURE_' >&2 || true
  exit 1
fi

echo "manifest: ${MANIFEST}" >&2
echo "ci-live-fight-android-capture: done → ${OUT_DIR}" >&2
