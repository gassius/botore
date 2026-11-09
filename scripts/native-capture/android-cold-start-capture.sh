#!/usr/bin/env bash
# Cold-start frame sequence + short video: native splash #302D27 → in-app title.
#
# Force-stops the package, plants a hold-title marker on external storage that
# the app mirrors into Documents on boot is not available on Android the same
# way — instead we clear app data so AuthEntry (title) shows after splash, then
# skip design-capture auto sign-in via a files-dir marker written with run-as
# when possible, else via clearing + temporary CAPTURE_SKIP (marker file).
#
# Usage: android-cold-start-capture.sh [--out DIR] [--seconds N]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
SECONDS_N="${CAPTURE_COLD_START_SEC:-8}"
PACKAGE="${CAPTURE_ANDROID_PACKAGE:-${PACKAGE_ANDROID}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --seconds)
      SECONDS_N="$2"
      shift 2
      ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

require_cmd adb
OUT_DIR="$(ensure_out_dir "${OUT_DIR}")"
STAMP="$(stamp)"
PREFIX="${OUT_DIR}/android-${STAMP}-ColdStart"
MANIFEST_NOTE="${OUT_DIR}/.cold-start-android-${STAMP}.txt"
: >"${MANIFEST_NOTE}"

echo "android-cold-start-capture: splash→title pkg=${PACKAGE} sec=${SECONDS_N}" >&2

adb shell am force-stop "${PACKAGE}" >/dev/null 2>&1 || true
# Clear app storage so we do not resume an authenticated Stable session.
adb shell pm clear "${PACKAGE}" >/dev/null 2>&1 || true
sleep 0.5

# Plant hold-title marker in app files dir (debuggable / run-as when available).
MARKER_JSON='{"holdTitle":true}'
if adb shell "run-as ${PACKAGE} mkdir -p files" >/dev/null 2>&1; then
  adb shell "run-as ${PACKAGE} sh -c 'echo ${MARKER_JSON} > files/botore-cold-start-intent.json'" >/dev/null 2>&1 || true
  # Expo documentDirectory maps to files/ on Android.
  echo "planted cold-start hold-title via run-as" >&2
else
  echo "warn: run-as unavailable; relying on cleared state + AuthEntry before auto sign-in race" >&2
fi

VIDEO="${PREFIX}.mp4"
REMOTE_VIDEO="/sdcard/botore-cold-start.mp4"
adb shell rm -f "${REMOTE_VIDEO}" >/dev/null 2>&1 || true

# screenrecord max ~180s; start then launch.
adb shell screenrecord --time-limit "${SECONDS_N}" "${REMOTE_VIDEO}" >/dev/null 2>&1 &
REC_PID=$!
cleanup_recorder() {
  if [[ -n "${REC_PID}" ]]; then
    kill -INT "${REC_PID}" >/dev/null 2>&1 || true
    wait "${REC_PID}" >/dev/null 2>&1 || true
    REC_PID=""
  fi
}
trap cleanup_recorder EXIT

sleep 0.4
adb shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
  adb shell am start -n "${PACKAGE}/.MainActivity" >/dev/null 2>&1 || true

FRAME_INTERVAL_MS="${CAPTURE_COLD_FRAME_INTERVAL_MS:-250}"
FRAME_COUNT="${CAPTURE_COLD_FRAME_COUNT:-16}"
for ((i = 0; i < FRAME_COUNT; i++)); do
  FRAME="${PREFIX}-frame$(printf '%02d' "${i}").png"
  REMOTE="/sdcard/botore-cold-frame.png"
  if adb shell screencap -p "${REMOTE}" >/dev/null 2>&1 \
    && adb pull "${REMOTE}" "${FRAME}" >/dev/null 2>&1 \
    && [[ -s "${FRAME}" ]]; then
    echo "cold-start frame: ${FRAME}" >&2
    echo "frame.${i}=${FRAME}" >>"${MANIFEST_NOTE}"
  else
    echo "warn: cold-start frame ${i} failed" >&2
  fi
  sleep "$(awk "BEGIN { printf \"%.3f\", ${FRAME_INTERVAL_MS}/1000 }")"
done

ELAPSED_MS=$((FRAME_COUNT * FRAME_INTERVAL_MS))
REMAIN_MS=$((SECONDS_N * 1000 - ELAPSED_MS))
if [[ "${REMAIN_MS}" -gt 0 ]]; then
  sleep "$(awk "BEGIN { printf \"%.3f\", ${REMAIN_MS}/1000 }")"
fi

cleanup_recorder
trap - EXIT

if adb pull "${REMOTE_VIDEO}" "${VIDEO}" >/dev/null 2>&1 && [[ -s "${VIDEO}" ]]; then
  echo "cold-start video: ${VIDEO}" >&2
  echo "video=${VIDEO}" >>"${MANIFEST_NOTE}"
  printf '%s\n' "${VIDEO}"
else
  echo "warn: cold-start video missing or empty" >&2
  FIRST_FRAME="$(ls -1 "${PREFIX}"-frame*.png 2>/dev/null | head -n 1 || true)"
  if [[ -n "${FIRST_FRAME}" ]]; then
    printf '%s\n' "${FIRST_FRAME}"
  else
    printf '%s\n' "${MANIFEST_NOTE}"
  fi
fi

# Cold-start cleared the app — relaunch for subsequent live-fight / route stills.
adb shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
