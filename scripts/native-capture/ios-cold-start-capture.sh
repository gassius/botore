#!/usr/bin/env bash
# Cold-start frame sequence: native splash #302D27 → launch-title silhouette
# (not AuthEntry / SpringBoard).
#
# Holds launch-title via Documents botore-cold-start-intent.json (skips design-
# capture auto sign-in).
#
# PRIMARY frames: timed `simctl io screenshot` burst. On GHA, `simctl launch`
# can take >40s after a fresh install. Sync-only launch then screenshot races
# the hold-title release (title-only strip: graphite still high, frames identical).
# Async-only launch raced the other way (SpringBoard-only). Hybrid:
#   1) kick launch in the background (long timeout)
#   2) immediately poll screenshots, discarding SpringBoard until graphiteShare
#      ≥ splash gate (native splash #302D27 held by preventAutoHide + hold dwell)
#   3) once splash is seen, continue bursting for the title transition window
# Hard-fail if splash never appears or we get fewer than 2 kept frames.
#
# Usage: ios-cold-start-capture.sh [--out DIR] [--udid UDID] [--seconds N]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
UDID="booted"
# Wall-clock after splash is seen (title silhouette under hold-title).
SECONDS_N="${CAPTURE_COLD_START_SEC:-24}"
# Max wait for first splash graphite frame after launch is kicked (SpringBoard discard).
# Covers slow GHA `simctl launch` plus a cushion for the first native-splash paint.
SPLASH_WAIT_SEC="${CAPTURE_COLD_SPLASH_WAIT_SEC:-120}"
# Fresh-install `simctl launch` on GHA often exceeds 40s.
LAUNCH_TIMEOUT_SEC="${CAPTURE_COLD_LAUNCH_TIMEOUT_SEC:-90}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"
SIMCTL_TIMEOUT_SEC="${CAPTURE_SIMCTL_TIMEOUT_SEC:-20}"
FRAME_MAX="${CAPTURE_COLD_FRAME_COUNT:-16}"
# Match assert-cold-start-transition default min graphite (12%).
SPLASH_MIN_GRAPHITE="${CAPTURE_COLD_MIN_GRAPHITE:-0.12}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --udid)
      UDID="$2"
      shift 2
      ;;
    --seconds)
      SECONDS_N="$2"
      shift 2
      ;;
    -h | --help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

require_cmd xcrun
require_cmd node
OUT_DIR="$(ensure_out_dir "${OUT_DIR}")"
STAMP="$(stamp)"
PREFIX="${OUT_DIR}/ios-${STAMP}-ColdStart"
MANIFEST_NOTE="${OUT_DIR}/.cold-start-${STAMP}.txt"
: >"${MANIFEST_NOTE}"

simctl_budget() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "${SIMCTL_TIMEOUT_SEC}" "$@"
  else
    "$@"
  fi
}

plant_hold_title() {
  local data_dir
  data_dir="$(simctl_budget xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
  if [[ -z "${data_dir}" || ! -d "${data_dir}" ]]; then
    simctl_budget xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
    sleep 2
    simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
    sleep 1
    data_dir="$(simctl_budget xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
  fi
  if [[ -n "${data_dir}" && -d "${data_dir}" ]]; then
    mkdir -p "${data_dir}/Documents"
    printf '%s\n' '{"holdTitle":true}' >"${data_dir}/Documents/botore-cold-start-intent.json"
    rm -f "${data_dir}/Documents/botore-design-capture-intent.json" || true
    echo "planted cold-start hold-title intent" >&2
    return 0
  fi
  echo "warn: no app data container; cold-start may auto sign-in to Stable" >&2
  return 1
}

graphite_of() {
  node "${SCRIPT_DIR}/graphite-share.mjs" "$1" 2>/dev/null || echo "0"
}

echo "ios-cold-start-capture: splash→title udid=${UDID} launch_timeout=${LAUNCH_TIMEOUT_SEC}s splash_wait=${SPLASH_WAIT_SEC}s title_sec=${SECONDS_N} max_frames=${FRAME_MAX}" >&2

simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 0.3
plant_hold_title || true

# Bring Simulator forward so the framebuffer composites (GHA).
osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1 || true

LAUNCH_LOG="$(mktemp "${OUT_DIR}/.cold-launch.XXXXXX.log")"
echo "cold-start: launching ${BUNDLE_ID} (async + parallel splash poll, launch_timeout ${LAUNCH_TIMEOUT_SEC}s)…" >&2

# Hybrid: kick launch in the background so screenshots can catch native splash
# while `simctl launch` is still returning on a slow GHA install.
LAUNCH_PID=""
if command -v timeout >/dev/null 2>&1; then
  timeout "${LAUNCH_TIMEOUT_SEC}" xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >"${LAUNCH_LOG}" 2>&1 &
  LAUNCH_PID=$!
else
  xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >"${LAUNCH_LOG}" 2>&1 &
  LAUNCH_PID=$!
fi

TMP_SHOT="$(mktemp "${OUT_DIR}/.cold-shot.XXXXXX.png")"
LAST_PRESPLASH="${PREFIX}-last-presplash.png"
splash_deadline="$(python3 -c "import time; print(time.time() + float('${SPLASH_WAIT_SEC}'))")"
splash_seen=0
i=0
discarded=0
relaunch_at="$(python3 -c "import time; print(time.time() + 12)")"

reap_launch() {
  if [[ -z "${LAUNCH_PID}" ]]; then
    return 0
  fi
  if ! kill -0 "${LAUNCH_PID}" >/dev/null 2>&1; then
    wait "${LAUNCH_PID}" >/dev/null 2>&1 || true
    LAUNCH_PID=""
  fi
}

while python3 -c "import time,sys; sys.exit(0 if time.time() < float('${splash_deadline}') else 1)"; do
  reap_launch

  # Periodic relaunch (idempotent) + bring Simulator forward — GHA sometimes
  # leaves SpringBoard composited after a slow first launch. Skip while the
  # initial launch process is still running.
  if [[ -z "${LAUNCH_PID}" ]] \
    && python3 -c "import time,sys; sys.exit(0 if time.time() >= float('${relaunch_at}') else 1)"; then
    xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >>"${LAUNCH_LOG}" 2>&1 || true
    osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1 || true
    relaunch_at="$(python3 -c "import time; print(time.time() + 12)")"
  fi

  rm -f "${TMP_SHOT}" >/dev/null 2>&1 || true
  if ! xcrun simctl io "${UDID}" screenshot "${TMP_SHOT}" >/dev/null 2>&1 \
    || [[ ! -s "${TMP_SHOT}" ]]; then
    echo "warn: splash-wait screenshot failed" >&2
    sleep 0.2
    continue
  fi
  g="$(graphite_of "${TMP_SHOT}")"
  g_ok="$(python3 -c "print(1 if float('${g}') >= float('${SPLASH_MIN_GRAPHITE}') else 0)")"
  if [[ "${g_ok}" != "1" ]]; then
    discarded=$((discarded + 1))
    cp "${TMP_SHOT}" "${LAST_PRESPLASH}" >/dev/null 2>&1 || true
    echo "cold-start discard SpringBoard/pre-splash frame graphite=${g} (discarded=${discarded})" >&2
    continue
  fi
  # First splash frame → frame00.
  frame="${PREFIX}-frame$(printf '%02d' "${i}").png"
  mv "${TMP_SHOT}" "${frame}"
  echo "cold-start frame: ${frame} graphite=${g} (splash gate)" >&2
  echo "frame.${i}=${frame}" >>"${MANIFEST_NOTE}"
  echo "splash.graphite=${g}" >>"${MANIFEST_NOTE}"
  splash_seen=1
  i=1
  break
done

# Finish / log the background launch once splash is seen (or timed out).
if [[ -n "${LAUNCH_PID}" ]]; then
  set +e
  wait "${LAUNCH_PID}"
  launch_rc=$?
  set -e
  LAUNCH_PID=""
else
  launch_rc=0
fi
if [[ -s "${LAUNCH_LOG}" ]]; then
  echo "cold-start launch log (rc=${launch_rc}):" >&2
  cat "${LAUNCH_LOG}" >&2 || true
fi

if [[ "${splash_seen}" != "1" ]]; then
  echo "error: native splash #302D27 never appeared within ${SPLASH_WAIT_SEC}s (discarded ${discarded} pre-splash frames)" >&2
  [[ -s "${LAST_PRESPLASH}" ]] && echo "presplash diagnostic: ${LAST_PRESPLASH}" >&2 || true
  rm -f "${LAUNCH_LOG}" "${TMP_SHOT}" >/dev/null 2>&1 || true
  exit 1
fi

# Continue bursting for title silhouette transition under hold-title.
# GarageRoot keeps native splash ≥ COLD_START_NATIVE_SPLASH_MIN_MS after hold
# is known, then hides to reveal LaunchTitleScreen — capture that change.
title_deadline="$(python3 -c "import time; print(time.time() + float('${SECONDS_N}'))")"
echo "cold-start title burst: wall_sec=${SECONDS_N} from splash (max_frames=${FRAME_MAX})" >&2
while python3 -c "import time,sys; sys.exit(0 if time.time() < float('${title_deadline}') else 1)"; do
  if [[ "${i}" -ge "${FRAME_MAX}" ]]; then
    break
  fi
  frame="${PREFIX}-frame$(printf '%02d' "${i}").png"
  if xcrun simctl io "${UDID}" screenshot "${frame}" >/dev/null 2>&1 \
    && [[ -s "${frame}" ]]; then
    g="$(graphite_of "${frame}")"
    echo "cold-start frame: ${frame} graphite=${g}" >&2
    echo "frame.${i}=${frame}" >>"${MANIFEST_NOTE}"
  else
    echo "warn: cold-start screenshot ${i} failed" >&2
    rm -f "${frame}" >/dev/null 2>&1 || true
  fi
  i=$((i + 1))
done

rm -f "${LAUNCH_LOG}" "${TMP_SHOT}" >/dev/null 2>&1 || true
rm -f "${LAST_PRESPLASH}" >/dev/null 2>&1 || true

extracted=0
for f in "${PREFIX}"-frame*.png; do
  [[ -e "${f}" ]] || continue
  [[ -s "${f}" ]] || continue
  extracted=$((extracted + 1))
done

if [[ "${extracted}" -lt 2 ]]; then
  echo "error: need ≥2 post-splash frames for splash→title assert (got ${extracted})" >&2
  exit 1
fi

echo "cold-start primary frames: ${extracted} post-splash screenshots (discarded_pre_splash=${discarded})" >&2
printf '%s\n' "${PREFIX}-frame00.png"
