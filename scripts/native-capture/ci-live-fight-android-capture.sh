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
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v1 node scripts/seed-atlas-storage.mjs

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
# A2b design gate: Fight View must seal an axe attacker (smear + KO evidence).
export EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON="${EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON:-axe}"
export EXPO_USE_COMMUNITY_AUTOLINKING=0
# Native splash must outlast emulator/SpringBoard compositing (~40s+ on GHA).
export EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS="${EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS:-60000}"
# Keep a single bake value for splash hold + capture weapon (prepare may rewrite .env).
tmp_env="$(mktemp)"
grep -vE '^EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS=|^EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON=' \
  "${REPO_ROOT}/apps/game/.env" >"${tmp_env}" || true
echo "EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS=${EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS}" >>"${tmp_env}"
echo "EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON=${EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON}" >>"${tmp_env}"
mv "${tmp_env}" "${REPO_ROOT}/apps/game/.env"

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
    EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS="${EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS}" \
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
  # Span past baked splash hold (default 60s) into title silhouette.
  export CAPTURE_COLD_FRAME_COUNT="${CAPTURE_COLD_FRAME_COUNT:-28}"
  export CAPTURE_COLD_FRAME_INTERVAL_MS="${CAPTURE_COLD_FRAME_INTERVAL_MS:-2500}"
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout "${CAPTURE_COLD_START_BUDGET_SEC:-180}" \
      "${SCRIPT_DIR}/android-cold-start-capture.sh" \
      --out "${OUT_DIR}" \
      --seconds "${CAPTURE_COLD_START_SEC:-75}"
  else
    "${SCRIPT_DIR}/android-cold-start-capture.sh" \
      --out "${OUT_DIR}" \
      --seconds "${CAPTURE_COLD_START_SEC:-75}"
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
  local mute="${5:-}"
  local customise="${6:-}"
  local home="${7:-}"
  local args=(
    --out "${OUT_DIR}"
    --route "${route}"
    --name "${label}"
  )
  if [[ -n "${ranking}" ]]; then
    args+=(--ranking "${ranking}")
  fi
  if [[ "${mute}" == "1" || "${mute}" == "true" ]]; then
    args+=(--mute)
  fi
  if [[ -n "${customise}" ]]; then
    args+=(--customise "${customise}")
  fi
  if [[ -n "${home}" ]]; then
    args+=(--home "${home}")
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

# 1′) E5/D5 Ludus More sheet — Ranking / Privacy / Delete / Sign out (red last)
capture_named Stable garage-more 5 "" "" "" more

# 1″) D5 Ludus Create slot card (home=create-slot)
capture_named Stable garage-create-slot 5 "" "" "" create-slot

# 1‴) D6 Create Bot view (at-rest under cap)
capture_named CreateBot create-bot 6

# 1⁗) D6 Create Bot at-cap blocked copy (home=at-cap)
capture_named CreateBot create-bot-at-cap 4 "" "" "" at-cap

# 1a) D3 Customise — Paint clean / dirty+dot / Equipped / Weapon Coming soon
# Capture early so design evidence lands even if later fight frames fail.
capture_named Customise customise-paint-clean 5 "" "" paint-clean
capture_named Customise customise-paint-dirty 5 "" "" paint-dirty
capture_named Customise customise-equipped 6 "" "" equipped
capture_named Customise customise-weapon-soon 5 "" "" weapon-soon
capture_named Customise customise-paint-hazard 5 "" "" paint-hazard
capture_named Customise customise-weapon-unlocked 5 "" "" weapon-unlocked
# 1a') A4 shapes — Head welder / Body boiler / heaviest combo / Equip saves shapes.
# shape-equipped persists the heaviest combo, so later fight stills wear it.
capture_named Customise customise-shape-head-welder 5 "" "" shape-head-welder
capture_named Customise customise-shape-body-boiler 5 "" "" shape-body-boiler
capture_named Customise customise-shape-heaviest 5 "" "" shape-heaviest
capture_named Customise customise-shape-equipped 6 "" "" shape-equipped
# Ludus card after Equip — must show heaviest shapes (not stock silhouette).
capture_named Stable garage-shapes-equipped 5 "" "" "" bot

# Ludus freshness: before Customise → Equip still → hardware Back → Ludus
# (must prove Back-after-Equip, not a fresh Stable deep-link — PRR M3).
capture_named Stable ludus-before-customise 4 "" "" "" bot
capture_named Customise customise-weapon-equipped-fresh 6 "" "" equipped
adb logcat -c >/dev/null 2>&1 || true
NAV_LUDUS_FRESH='BOTORE_CAPTURE_NAV:route=Stable overlay=0'
adb shell input keyevent 4 >/dev/null
if ! wait_logcat_marker "${NAV_LUDUS_FRESH}" 20; then
  echo "error: Customise hardware Back did not land on Ludus after Equip still" >&2
  adb logcat -d 2>/dev/null | tr -d '\r' | grep -aE 'BOTORE_CAPTURE_NAV' >&2 || true
  exit 1
fi
sleep 1
capture_current ludus-after-equip-back
echo "ok: ludus-after-equip-back (Customise Back → Ludus after Equip)" >&2

# 1a″) E6 / D8 Opponents — seeded online roster at rest (NOT sessionFailure).
# Need ≥3 whole 175pt cards (185 snap, 150pt robots). Seed has Sir/Dex/Tank.
# Capture before C10 offline/auth stills so the pack has a real snapped list.
CAPTURE_SETTLE_SEC=6 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Opponents \
  --name opponents-snap-rest >/dev/null
opponents_rest_matches=( "${OUT_DIR}"/android-*-opponents-snap-rest.png )
if [[ ! -e "${opponents_rest_matches[0]:-}" ]]; then
  echo "error: missing PNG for opponents-snap-rest" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "still.android.opponents-snap-rest" "${opponents_rest_matches[0]}"
echo "ok: ${opponents_rest_matches[0]}" >&2

# 1a′) D4 Ranking — Bots / Botores (fixture portraits + W–L), empty, loading
# Early so design review frames land even if later fight frames fail.
capture_named Ranking ranking-bots 5 bots
capture_named Ranking ranking-botores 5 botores
capture_named Ranking ranking-empty 4 empty
capture_named Ranking ranking-loading 3 loading

# 1b) C9 Settings — mute / Music / Effects / reduced motion
capture_named Settings settings 4

# 1c) D8 Opponents — live A5 roster names + Botore + W–L (E3 quota panel).
capture_named Opponents opponents-roster 6

# 1c″) D8 Opponents — design-capture fightQuota=remaining → 2/3 + refill countdown
# Same-route after opponents-roster: deep-link, wait for quota marker (Full fails CI),
# then screencap the current frame (do not race the first paint).
adb logcat -c >/dev/null 2>&1 || true
# args: route mute paint weapon ranking fail_closed session_failure fight_view
#        customise pose_compare result home fight_quota
QUOTA_URL="$(capture_url_for_route Opponents "" "" "" "" "" "" "" "" "" "" "" remaining)"
echo "opening ${QUOTA_URL}" >&2
adb shell am start -a android.intent.action.VIEW -d "${QUOTA_URL}" >/dev/null
QUOTA_MARKER='BOTORE_CAPTURE_QUOTA:remaining=2 limit=3'
if ! wait_logcat_marker "${QUOTA_MARKER}" 45; then
  echo "error: missing ${QUOTA_MARKER} after fightQuota=remaining — still would show Full 3/3" >&2
  adb logcat -d 2>/dev/null | tr -d '\r' | grep -aE 'BOTORE_CAPTURE_QUOTA|BOTORE_CAPTURE_ROUTE' >&2 || true
  exit 1
fi
sleep 2
capture_current opponents-quota-remaining
echo "ok: opponents-quota-remaining gated on ${QUOTA_MARKER}" >&2

# 1c‴) D8 Opponents — fightQuota=exhausted → 0/3 + countdown (no redundant warning box)
adb logcat -c >/dev/null 2>&1 || true
QUOTA_EXHAUSTED_URL="$(capture_url_for_route Opponents "" "" "" "" "" "" "" "" "" "" "" exhausted)"
echo "opening ${QUOTA_EXHAUSTED_URL}" >&2
adb shell am start -a android.intent.action.VIEW -d "${QUOTA_EXHAUSTED_URL}" >/dev/null
QUOTA_EXHAUSTED_MARKER='BOTORE_CAPTURE_QUOTA:remaining=0 limit=3'
if ! wait_logcat_marker "${QUOTA_EXHAUSTED_MARKER}" 45; then
  echo "error: missing ${QUOTA_EXHAUSTED_MARKER} after fightQuota=exhausted" >&2
  adb logcat -d 2>/dev/null | tr -d '\r' | grep -aE 'BOTORE_CAPTURE_QUOTA|BOTORE_CAPTURE_ROUTE' >&2 || true
  exit 1
fi
sleep 2
capture_current opponents-quota-exhausted
echo "ok: opponents-quota-exhausted gated on ${QUOTA_EXHAUSTED_MARKER}" >&2

# 1c⁗) Opponents → hardware Back → Ludus (must not land on Customise).
# Open Opponents first, then clear logcat so the Stable marker can only come
# from Back (PRR M3 — not a stale deep-link boot line).
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Opponents \
  --name opponents-before-back >/dev/null
opponents_before_back=( "${OUT_DIR}"/android-*-opponents-before-back.png )
if [[ ! -e "${opponents_before_back[0]:-}" ]]; then
  echo "error: missing PNG for opponents-before-back" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "still.android.opponents-before-back" "${opponents_before_back[0]}"
NAV_LUDUS_MARKER='BOTORE_CAPTURE_NAV:route=Stable overlay=0'
NAV_CUSTOMISE_MARKER='BOTORE_CAPTURE_NAV:route=Customise overlay=0'
adb logcat -c >/dev/null 2>&1 || true
adb shell input keyevent 4 >/dev/null
if ! wait_logcat_marker "${NAV_LUDUS_MARKER}" 20; then
  echo "error: Opponents hardware Back did not land on Ludus (Stable)" >&2
  adb logcat -d 2>/dev/null | tr -d '\r' | grep -aE 'BOTORE_CAPTURE_NAV' >&2 || true
  exit 1
fi
if adb logcat -d 2>/dev/null | tr -d '\r' | grep -aFq "${NAV_CUSTOMISE_MARKER}"; then
  echo "error: Opponents hardware Back landed on Customise (must be Ludus)" >&2
  exit 1
fi
sleep 1
capture_current opponents-back-to-ludus
echo "ok: opponents-back-to-ludus (hardware Back → Ludus; logcat cleared pre-Back)" >&2

# 1c′) E6 / D8 Opponents — seeded online roster at rest (NOT sessionFailure).
# Need ≥3 whole 175pt cards (185 snap, 150pt robots). Capture before C10
# offline/auth stills so the pack has a real snapped list.
CAPTURE_SETTLE_SEC=6 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Opponents \
  --name opponents-snap-rest >/dev/null
opponents_rest_matches=( "${OUT_DIR}"/android-*-opponents-snap-rest.png )
if [[ ! -e "${opponents_rest_matches[0]:-}" ]]; then
  echo "error: missing PNG for opponents-snap-rest" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "still.android.opponents-snap-rest" "${opponents_rest_matches[0]}"
# Empty list boards are ~50–60KB cream chrome; three robot cards land larger.
rest_bytes=$(wc -c < "${opponents_rest_matches[0]}")
if [[ "${rest_bytes}" -lt 60000 ]]; then
  echo "error: opponents-snap-rest looks empty (${rest_bytes} bytes < 60000) — list must show 3 cards" >&2
  exit 1
fi
echo "ok: ${opponents_rest_matches[0]} (${rest_bytes} bytes)" >&2

# 1d) BT-272 — select a non-first owned bot before the live fight.
# Seed Ash Crown as second bot, set accounts.active_character_id to it, and
# rename the first bot to Gaskiller so a wrong LIMIT-1 attacker is obvious.
echo "BT-272: seeding Ash Crown as active (non-first) bot…" >&2
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $$
declare
  uid uuid := '00000000-0000-4000-8000-000000000001';
  ash text := 'player-ash-crown';
  v_sound jsonb;
begin
  update public.characters
     set display_name = 'Gaskiller'
   where character_id = 'player-hero'
     and account_id = uid;

  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  select uid, v.p, 1, 'bt272-capture'
    from (values ('paint-cobalt'), ('weapon-axe')) as v(p)
   where public.owned_part_quantity(uid, v.p) < 1;

  if not exists (
    select 1 from public.characters c
     where c.character_id = ash and c.account_id = uid
  ) then
    insert into public.characters (
      character_id, account_id, display_name, is_opponent, owner_is_npc
    ) values (ash, uid, 'Ash Crown', false, false);

    insert into public.character_build_versions (
      character_id, hp, strength, agility, speed, weapon_kind, weapon_power
    )
    select ash, 30, 5, 5, 6,
           coalesce(pc.weapon_kind, 'axe'),
           coalesce(pc.weapon_power, 5)
      from public.parts_catalogue pc
     where pc.part_id = 'weapon-axe'
       and pc.slot_kind = 'weapon'
       and pc.is_active;

    select coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)
      into v_sound
      from (
        select distinct jsonb_array_elements_text(pc.sound_tags) as tag
          from public.parts_catalogue pc
         where pc.part_id in ('chassis-basic', 'weapon-axe')
      ) t
     where tag is not null and tag <> '';

    insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
    values (
      ash,
      jsonb_build_object(
        'chassis', 'chassis-basic',
        'paint', 'paint-cobalt',
        'weapon', 'weapon-axe',
        'decals', '[]'::jsonb,
        'soundTags', coalesce(v_sound, '[]'::jsonb),
        'shield', null,
        'drone', null
      ),
      'v1'
    );
  end if;

  update public.accounts
     set active_character_id = ash
   where id = uid;
end $$;
SQL
ASH_ACTIVE="$(psql "${DATABASE_URL}" -Atc "select active_character_id from public.accounts where id = '00000000-0000-4000-8000-000000000001'")"
if [[ "${ASH_ACTIVE}" != "player-ash-crown" ]]; then
  echo "error: BT-272 active_character_id=${ASH_ACTIVE} (expected player-ash-crown)" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "bt272_active_character_id" "${ASH_ACTIVE}"
# Cold-start so hydrate picks Ash Crown (not an in-memory Gaskiller loadout).
# android-screencap asserts the package is already foreground before deep-link —
# mirror the boot path: force-stop → monkey launch → wait pid + auth.
adb shell am force-stop "${PACKAGE}" >/dev/null 2>&1 || true
adb logcat -c >/dev/null 2>&1 || true
adb shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null
echo "BT-272: waiting for ${PACKAGE} after Ash Crown select…" >&2
booted=0
for _ in $(seq 1 60); do
  if adb shell pidof -s "${PACKAGE}" 2>/dev/null | tr -d '\r' | grep -q '[0-9]'; then
    booted=1
    break
  fi
  sleep 1
done
if [[ "${booted}" != "1" ]]; then
  echo "error: BT-272 ${PACKAGE} did not start after Ash Crown select" >&2
  adb logcat -d -t 160 '*:E' >&2 || true
  exit 1
fi
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
  echo "error: BT-272 design-capture auto sign-in did not succeed after Ash Crown select" >&2
  adb logcat -d 2>/dev/null | tr -d '\r' | grep -aE 'BOTORE_CAPTURE_' >&2 || true
  exit 1
fi
# Prefer hydrate for Ash Crown; fall back to any hydrate-ok (auth may race list).
hydrate_ok=0
for _ in $(seq 1 45); do
  if adb logcat -d 2>/dev/null | tr -d '\r' | grep -Fq 'BOTORE_CAPTURE_HYDRATE_OK:characterId=player-ash-crown'; then
    hydrate_ok=1
    break
  fi
  if adb logcat -d 2>/dev/null | tr -d '\r' | grep -Fq 'BOTORE_CAPTURE_HYDRATE_ERROR:'; then
    break
  fi
  sleep 1
done
if [[ "${hydrate_ok}" != "1" ]]; then
  echo "error: BT-272 hydrate did not confirm player-ash-crown" >&2
  adb logcat -d 2>/dev/null | tr -d '\r' | grep -aE 'BOTORE_CAPTURE_HYDRATE|BOTORE_CAPTURE_AUTH' >&2 || true
  exit 1
fi
android_assert_app_foreground "${PACKAGE}"
echo "ok: BT-272 cold hydrate Ash Crown" >&2

# 2) Confirm — both bots; deep-link weapon=axe so live-fight pin saves before Replay.
# Active bot is Ash Crown (non-first) — Confirm nameplate must match.
CAPTURE_SETTLE_SEC=8 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route ConfirmFight \
  --name confirm \
  --weapon axe >/dev/null
confirm_matches=( "${OUT_DIR}"/android-*-confirm.png )
if [[ ! -e "${confirm_matches[0]:-}" ]]; then
  echo "error: missing PNG for confirm" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "still.android.confirm" "${confirm_matches[0]}"
echo "ok: ${confirm_matches[0]}" >&2

# 3) Replay — live-capture starts paused (~3s idle) so replay-start is NOT the
# first hit-hold frame. Settle must stay below FX_CAPTURE_IDLE_BEFORE_PLAY_MS.
# Then poll fight proof + arena/FX markers; stills land while FX peak is frozen.
# Weapon=axe keeps the capture pin if Confirm settle raced the save.
# BT-272: same still proves fight header shows the non-first selected bot.
CAPTURE_SETTLE_SEC=2 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Replay \
  --name replay-start \
  --weapon axe >/dev/null
replay_start_matches=( "${OUT_DIR}"/android-*-replay-start.png )
if [[ ! -e "${replay_start_matches[0]:-}" ]]; then
  echo "error: missing PNG for replay-start" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "still.android.replay-start" "${replay_start_matches[0]}"
# E2 / D10 — quiet call-out band (empty dashed plate + in-arena ARENA · REPAIR YARD).
write_manifest_line "${MANIFEST}" "still.android.fight-view-callout-quiet" "${replay_start_matches[0]}"
# Dedicated BT-272 label (same frame: HUD header after non-first bot select).
cp -f "${replay_start_matches[0]}" "${OUT_DIR}/android-$(date +%Y%m%d-%H%M%S)-replay-selected-bot-header.png"
selected_header_matches=( "${OUT_DIR}"/android-*-replay-selected-bot-header.png )
write_manifest_line "${MANIFEST}" "still.android.replay-selected-bot-header" "${selected_header_matches[0]}"
echo "ok: ${replay_start_matches[0]}" >&2
echo "ok: ${selected_header_matches[0]} (BT-272 selected-bot fight header)" >&2

FIGHT_LINE=""
FIGHT_JSON=""
FX_HIT="0"
FX_DODGE="0"
FX_DEFEAT="0"
GOT_ARENA=0
GOT_HIT=0
GOT_DODGE=0
GOT_DEFEAT=0
# Hit + dodge each freeze ~8s; long sealed fights still need room for defeat.
FIGHT_WAIT_SEC="${CAPTURE_FIGHT_WAIT_SEC:-240}"
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
  # Wait out the ~8s FX hold so the next family (esp. defeat) can fire.
  local resume_deadline=$((SECONDS + 12))
  if ! logcat_has "${resume_marker}"; then
    echo "waiting for ${hold_marker} resume…" >&2
    while (( SECONDS < resume_deadline )) && ! logcat_has "${resume_marker}"; do
      sleep 0.5
    done
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
      ATTACKER_NAME="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.attackerDisplayName||''))" "${FIGHT_JSON}")"
      ATTACKER_ID="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.attackerCharacterId||''))" "${FIGHT_JSON}")"
      SELECTED_ID="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.selectedCharacterId||''))" "${FIGHT_JSON}")"
      write_manifest_line "${MANIFEST}" bt272_attacker_display_name "${ATTACKER_NAME}"
      write_manifest_line "${MANIFEST}" bt272_attacker_character_id "${ATTACKER_ID}"
      write_manifest_line "${MANIFEST}" bt272_selected_character_id "${SELECTED_ID}"
      echo "fight proof: battleId=${BATTLE_ID} xp=${XP} fx hit=${FX_HIT} dodge=${FX_DODGE} defeat=${FX_DEFEAT} attacker=${ATTACKER_NAME}" >&2
      if [[ "${FX_HIT}" -lt 1 || "${FX_DEFEAT}" -lt 1 ]]; then
        echo "error: sealed replay missing required FX events (hit=${FX_HIT} defeat=${FX_DEFEAT})" >&2
        exit 1
      fi
      # BT-272: header/record identity must be Ash Crown (non-first selected), not Gaskiller.
      if [[ "${ATTACKER_ID}" != "player-ash-crown" ]]; then
        echo "error: BT-272 attackerCharacterId=${ATTACKER_ID} (expected player-ash-crown)" >&2
        exit 1
      fi
      if ! node -e "const n=String(process.argv[1]||'').toLowerCase(); if(!n.includes('ash')) process.exit(2)" "${ATTACKER_NAME}"; then
        echo "error: BT-272 attackerDisplayName='${ATTACKER_NAME}' (expected Ash Crown)" >&2
        exit 1
      fi
      if [[ -n "${SELECTED_ID}" && "${SELECTED_ID}" != "player-ash-crown" ]]; then
        echo "error: BT-272 selectedCharacterId=${SELECTED_ID} (expected player-ash-crown)" >&2
        exit 1
      fi
      # Record must land on Ash Crown, not Gaskiller / player-hero.
      ASH_WINS="$(psql "${DATABASE_URL}" -Atc "select coalesce(wins,0) from public.bot_fight_records where character_id = 'player-ash-crown'")"
      HERO_DELTA="$(psql "${DATABASE_URL}" -Atc "select count(*) from public.battle_participants bp join public.battles b using (battle_id) where bp.character_id = 'player-hero' and b.battle_id = '${BATTLE_ID}'")"
      ASH_PART="$(psql "${DATABASE_URL}" -Atc "select count(*) from public.battle_participants where battle_id = '${BATTLE_ID}' and character_id = 'player-ash-crown' and side = 'attacker'")"
      if [[ "${ASH_PART}" != "1" ]]; then
        echo "error: BT-272 Ash Crown missing as attacker participant (count=${ASH_PART})" >&2
        exit 1
      fi
      if [[ "${HERO_DELTA}" != "0" ]]; then
        echo "error: BT-272 player-hero participated in this battle (must be Ash Crown only)" >&2
        exit 1
      fi
      write_manifest_line "${MANIFEST}" bt272_ash_crown_wins "${ASH_WINS}"
      echo "ok: BT-272 fight identity Ash Crown (wins=${ASH_WINS})" >&2
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

# Last-chance defeat: HOLD may land on the final poll tick after FX_DEADLINE.
if [[ "${GOT_DEFEAT}" -eq 0 ]] && logcat_has 'BOTORE_CAPTURE_FX_HOLD:family=defeat'; then
  echo "note: late defeat FX hold — capturing after poll window" >&2
  capture_fx_while_held defeat replay-fx-defeat
  GOT_DEFEAT=1
fi

if [[ "${FX_DODGE}" -eq 0 ]]; then
  write_manifest_line "${MANIFEST}" fx_dodge "absent-from-recorded-events"
  echo "note: no dodge in sealed replay — dodge FX correctly not invented" >&2
fi

if [[ "${GOT_HIT}" -eq 0 || "${GOT_DEFEAT}" -eq 0 ]]; then
  echo "error: required FX stills missing after ${FIGHT_WAIT_SEC}s (hit=${GOT_HIT} defeat=${GOT_DEFEAT})" >&2
  logcat_dump | grep -aE 'BOTORE_CAPTURE_FX_|BOTORE_CAPTURE_FIGHT_|BOTORE_CAPTURE_WEAPON_PIN' >&2 || true
  ls -la "${OUT_DIR}" >&2 || true
  exit 1
fi

# A2b design gate: Fight View axe mid-attack (smear) + axe KO on floor.
# Promote the live replay FX holds — do not use ConfirmFight idle stills.
ATTACKER_WEAPON="$(node -e "const j=JSON.parse(process.argv[1]); console.log(String(j.attackerWeapon||''))" "${FIGHT_JSON}")"
write_manifest_line "${MANIFEST}" attacker_weapon "${ATTACKER_WEAPON}"
if [[ "${ATTACKER_WEAPON}" != *axe* ]]; then
  echo "error: live fight attackerWeapon=${ATTACKER_WEAPON} (want weapon-axe) — axe Fight View evidence missing" >&2
  logcat_dump | grep -aE 'BOTORE_CAPTURE_WEAPON_PIN|BOTORE_CAPTURE_FIGHT_' >&2 || true
  exit 1
fi
hit_matches=( "${OUT_DIR}"/android-*-replay-fx-hit.png )
defeat_matches=( "${OUT_DIR}"/android-*-replay-fx-defeat.png )
if [[ ! -e "${hit_matches[0]:-}" || ! -e "${defeat_matches[0]:-}" ]]; then
  echo "error: missing replay-fx-hit / replay-fx-defeat for axe Fight View copies (hit=${hit_matches[0]:-none} defeat=${defeat_matches[0]:-none})" >&2
  exit 1
fi
STAMP="$(stamp)"
axe_attack="${OUT_DIR}/android-${STAMP}-FightView-axe-attack.png"
axe_ko="${OUT_DIR}/android-${STAMP}-FightView-axe-knockout.png"
# Keep prior design-review filenames as aliases (content is Fight View, not Confirm).
alias_attack="${OUT_DIR}/android-${STAMP}-ConfirmFight-axe-attack.png"
alias_ko="${OUT_DIR}/android-${STAMP}-ConfirmFight-axe-knockout.png"
cp "${hit_matches[0]}" "${axe_attack}"
cp "${defeat_matches[0]}" "${axe_ko}"
cp "${axe_attack}" "${alias_attack}"
cp "${axe_ko}" "${alias_ko}"
if cmp -s "${axe_attack}" "${axe_ko}"; then
  echo "error: FightView-axe-attack is byte-identical to FightView-axe-knockout" >&2
  exit 1
fi
write_manifest_line "${MANIFEST}" "still.android.FightView-axe-attack" "${axe_attack}"
# E2 / D10 — mid-fight call-out plate evidence (queued dwell ≥ 1.2 s).
write_manifest_line "${MANIFEST}" "still.android.fight-view-callout-mid" "${axe_attack}"
write_manifest_line "${MANIFEST}" "still.android.FightView-axe-knockout" "${axe_ko}"
write_manifest_line "${MANIFEST}" "still.android.ConfirmFight-axe-attack" "${alias_attack}"
write_manifest_line "${MANIFEST}" "still.android.ConfirmFight-axe-knockout" "${alias_ko}"
echo "ok: Fight View axe attack=${axe_attack} knockout=${axe_ko} (attacker=${ATTACKER_WEAPON})" >&2

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

# 3b) Fight nav + rewatch controls — real taps on the live first-watch Result.
# Ranking → Back (hardware and header) must land on the Result overlay, not
# Ludus; Watch again shows replay controls under the hit-message plate.
# Landing is asserted from BOTORE_CAPTURE_NAV markers. uiautomator flakes only
# warn; a Back that lands on Ludus fails the job.
UI_XML=/tmp/botore-ui.xml
NAV_RESULT='BOTORE_CAPTURE_NAV:route=Replay overlay=1'
NAV_LUDUS='BOTORE_CAPTURE_NAV:route=Stable overlay=0'

android_ui_dump() {
  local _
  for _ in 1 2 3 4 5; do
    if adb shell uiautomator dump /sdcard/botore-ui.xml >/dev/null 2>&1 &&
      adb exec-out cat /sdcard/botore-ui.xml >"${UI_XML}" 2>/dev/null &&
      grep -q '<hierarchy' "${UI_XML}"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

android_find() {
  node "${SCRIPT_DIR}/android-ui-find.mjs" --xml "${UI_XML}" --label "$1" ${2:-}
}

android_tap_label() {
  local xy
  if ! android_ui_dump; then
    echo "warn: uiautomator dump failed (tap '$1')" >&2
    return 1
  fi
  if ! xy="$(android_find "$1")"; then
    echo "warn: no UI node '$1'" >&2
    return 1
  fi
  # shellcheck disable=SC2086
  adb shell input tap ${xy}
}

wait_ui_label() {
  local deadline=$((SECONDS + ${2:-30}))
  while ((SECONDS < deadline)); do
    if android_ui_dump && android_find "$1" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

marker_count() {
  logcat_dump | grep -aFc "$1" || true
}

wait_marker_after() {
  local marker="$1" baseline="$2" deadline=$((SECONDS + ${3:-20}))
  while ((SECONDS < deadline)); do
    if (($(marker_count "${marker}") > baseline)); then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

# Ranking from the Result, then leave via $1 (hardware|header). Stills: $2.
ranking_round_trip() {
  local via="$1" label="$2" result_before ludus_before
  result_before="$(marker_count "${NAV_RESULT}")"
  ludus_before="$(marker_count "${NAV_LUDUS}")"
  if ! android_tap_label "Ranking"; then
    write_manifest_line "${MANIFEST}" "fight_nav_ranking_back_${via}" "skipped-ui"
    return 0
  fi
  sleep 4
  capture_current "ranking-from-result-${via}" || true
  if [[ "${via}" == "hardware" ]]; then
    adb shell input keyevent KEYCODE_BACK || true
  elif ! android_tap_label "Back"; then
    write_manifest_line "${MANIFEST}" "fight_nav_ranking_back_${via}" "skipped-ui"
    return 0
  fi
  if wait_marker_after "${NAV_RESULT}" "${result_before}" 10; then
    sleep 2
    capture_current "${label}" || true
    write_manifest_line "${MANIFEST}" "fight_nav_ranking_back_${via}" "result-overlay"
    echo "ok: Ranking ${via} Back → Result overlay" >&2
  elif (($(marker_count "${NAV_LUDUS}") > ludus_before)); then
    capture_current "${label}" || true
    write_manifest_line "${MANIFEST}" "fight_nav_ranking_back_${via}" "ludus-REGRESSION"
    echo "error: Ranking ${via} Back landed on Ludus, not the fight Result" >&2
    missing=1
  else
    write_manifest_line "${MANIFEST}" "fight_nav_ranking_back_${via}" "unknown"
    echo "warn: no nav marker after Ranking ${via} Back" >&2
  fi
}

# Fight proof is already in the manifest; a fresh, larger buffer keeps the
# marker counts below from shrinking when the ring buffer rotates.
adb logcat -G 8M >/dev/null 2>&1 || true
adb logcat -c >/dev/null 2>&1 || true
echo "fight nav: waiting for first-watch Result overlay…" >&2
if wait_ui_label "Watch again" 60; then
  sleep 2
  capture_current fight-end-result || true
  ranking_round_trip hardware result-after-ranking-hardware-back
  ranking_round_trip header result-after-ranking-header-back

  echo "rewatch controls: Watch again → first hit hold…" >&2
  hit_holds="$(marker_count 'BOTORE_CAPTURE_FX_HOLD:family=hit')"
  hit_resumes="$(marker_count 'BOTORE_CAPTURE_FX_RESUME:family=hit')"
  if android_tap_label "Watch again" &&
    wait_marker_after 'BOTORE_CAPTURE_FX_HOLD:family=hit' "${hit_holds}" 30; then
    sleep 0.35
    capture_current rewatch-controls-hit || true
    # Playback is frozen on the hit, so the dump is idle; controls do not move.
    play_xy=""
    speed_xy=""
    scrub_box=""
    if android_ui_dump; then
      play_xy="$(android_find "Play" || android_find "Pause" || true)"
      speed_xy="$(android_find "Fast forward" || true)"
      scrub_box="$(android_find "Fight progress" --bounds || true)"
    fi
    wait_marker_after 'BOTORE_CAPTURE_FX_RESUME:family=hit' "${hit_resumes}" 12 || true
    sleep 1
    capture_current rewatch-controls-playing || true
    if [[ -n "${speed_xy}" ]]; then
      # shellcheck disable=SC2086
      adb shell input tap ${speed_xy} || true
      sleep 1
      capture_current rewatch-controls-fast || true
    fi
    if [[ -n "${play_xy}" ]]; then
      # shellcheck disable=SC2086
      adb shell input tap ${play_xy} || true
      sleep 1
      capture_current rewatch-controls-paused || true
    fi
    if [[ -n "${scrub_box}" ]]; then
      read -r sx1 sy1 sx2 sy2 <<<"${scrub_box}"
      sy=$(((sy1 + sy2) / 2))
      adb shell input swipe $((sx1 + (sx2 - sx1) * 8 / 10)) "${sy}" \
        $((sx1 + (sx2 - sx1) * 3 / 10)) "${sy}" 400 || true
      sleep 1.5
      capture_current rewatch-controls-scrubbed || true
    fi
    write_manifest_line "${MANIFEST}" "rewatch_controls" "play=${play_xy:-none} speed=${speed_xy:-none} scrub=${scrub_box:-none}"
  else
    echo "warn: rewatch controls stills skipped (Watch again tap / hit hold)" >&2
  fi
else
  echo "warn: first-watch Result overlay not found — fight nav stills skipped" >&2
fi

# 4) Result — backend XP / allowances (after server confirm so UI can show XP)
capture_named FightResult result 5

# 4a) D1 rewatch Fight View — back + replay controls (non-gating; design re-check)
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Replay \
  --name fight-view-rewatch \
  --fight-view rewatch >/dev/null
rewatch_matches=( "${OUT_DIR}"/android-*-fight-view-rewatch.png )
if [[ -e "${rewatch_matches[0]:-}" ]]; then
  write_manifest_line "${MANIFEST}" "still.android.fight-view-rewatch" "${rewatch_matches[0]}"
  echo "ok: ${rewatch_matches[0]}" >&2
else
  echo "warn: missing fight-view-rewatch PNG (non-gating)" >&2
fi

# 4b) C9 muted replay still (same sealed fight; mute=1 deep link)
capture_named Replay replay-muted 3 "" 1

# 5) C5 Ranking — live board (list_bot_ranking + seed peers + fight XP) + error
# (bots/botores/empty/loading already captured early for D4 design review)
capture_named Ranking ranking-live 6 live
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

# 7) C10 offline + auth-expired banners on ≥2 screens (Opponents + Ranking).
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Opponents \
  --name session-offline-opponents \
  --session-failure offline >/dev/null
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Ranking \
  --name session-auth-expired-ranking \
  --session-failure auth_expired >/dev/null
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Ranking \
  --name session-offline-ranking \
  --session-failure offline >/dev/null
CAPTURE_SETTLE_SEC=4 \
  "${SCRIPT_DIR}/android-screencap.sh" \
  --out "${OUT_DIR}" \
  --route Opponents \
  --name session-auth-expired-opponents \
  --session-failure auth_expired >/dev/null
for c10_label in session-offline-opponents session-auth-expired-ranking session-offline-ranking session-auth-expired-opponents; do
  c10_matches=( "${OUT_DIR}"/android-*-"${c10_label}".png )
  if [[ -e "${c10_matches[0]:-}" ]]; then
    write_manifest_line "${MANIFEST}" "still.android.${c10_label}" "${c10_matches[0]}"
    echo "ok: ${c10_matches[0]}" >&2
  else
    echo "error: missing ${c10_label} PNG" >&2
    missing=1
  fi
done
write_manifest_line "${MANIFEST}" "c10_session_failure" "design-capture-sessionFailure-deep-link"

# Assert required stills exist (if-no-files-found equivalent).
missing="${missing:-0}"
required_labels=(
  garage
  garage-more
  garage-create-slot
  create-bot
  create-bot-at-cap
  customise-paint-clean
  customise-paint-dirty
  customise-equipped
  customise-weapon-soon
  customise-paint-hazard
  customise-weapon-unlocked
  customise-shape-head-welder
  customise-shape-body-boiler
  customise-shape-heaviest
  customise-shape-equipped
  garage-shapes-equipped
  ludus-before-customise
  customise-weapon-equipped-fresh
  ludus-after-equip-back
  opponents-snap-rest
  opponents-quota-remaining
  opponents-quota-exhausted
  opponents-before-back
  opponents-back-to-ludus
  ranking-bots
  ranking-botores
  ranking-empty
  ranking-loading
  settings
  confirm
  arena-layers
  replay-start
  replay-selected-bot-header
  replay-fx-hit
  replay-fx-defeat
  FightView-axe-attack
  FightView-axe-knockout
  result
  replay-muted
  ranking-live
  ranking-error
  playable-misconfigured
  session-offline-opponents
  session-auth-expired-ranking
  session-offline-ranking
  session-auth-expired-opponents
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
