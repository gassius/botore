#!/usr/bin/env bash
# Cold-start frame sequence + short video: native splash #302D27 → in-app title.
#
# Holds AuthEntry title (skips design-capture auto sign-in) via Documents
# botore-cold-start-intent.json. Hard-bounded simctl calls + recordVideo trap
# so a hang cannot burn the 90-minute iOS job (C7b PRR P2).
#
# Usage: ios-cold-start-capture.sh [--out DIR] [--udid UDID] [--seconds N]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
UDID="booted"
SECONDS_N="${CAPTURE_COLD_START_SEC:-8}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"
# Per-call budget for flaky simctl (seconds).
SIMCTL_TIMEOUT_SEC="${CAPTURE_SIMCTL_TIMEOUT_SEC:-20}"

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
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

require_cmd xcrun
OUT_DIR="$(ensure_out_dir "${OUT_DIR}")"
STAMP="$(stamp)"
PREFIX="${OUT_DIR}/ios-${STAMP}-ColdStart"
MANIFEST_NOTE="${OUT_DIR}/.cold-start-${STAMP}.txt"
: >"${MANIFEST_NOTE}"

simctl_budget() {
  # Prefer GNU timeout when present (macOS-15 GHA has /usr/bin/timeout).
  if command -v timeout >/dev/null 2>&1; then
    timeout "${SIMCTL_TIMEOUT_SEC}" "$@"
  else
    "$@"
  fi
}

REC_PID=""
cleanup_recorder() {
  if [[ -n "${REC_PID}" ]]; then
    kill -INT "${REC_PID}" >/dev/null 2>&1 || true
    # Give recordVideo a moment to finalize; then hard-kill.
    sleep 1
    kill -KILL "${REC_PID}" >/dev/null 2>&1 || true
    wait "${REC_PID}" >/dev/null 2>&1 || true
    REC_PID=""
  fi
}
trap cleanup_recorder EXIT

echo "ios-cold-start-capture: splash→title udid=${UDID} sec=${SECONDS_N}" >&2

simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 0.5

# Ensure Documents exists, then plant hold-title marker (skip auto sign-in).
DATA_DIR="$(simctl_budget xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
if [[ -z "${DATA_DIR}" || ! -d "${DATA_DIR}" ]]; then
  simctl_budget xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 2
  simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 1
  DATA_DIR="$(simctl_budget xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
fi
if [[ -n "${DATA_DIR}" && -d "${DATA_DIR}" ]]; then
  mkdir -p "${DATA_DIR}/Documents"
  printf '%s\n' '{"holdTitle":true}' >"${DATA_DIR}/Documents/botore-cold-start-intent.json"
  # Clear any leftover route intent so we stay on AuthEntry title.
  rm -f "${DATA_DIR}/Documents/botore-design-capture-intent.json" || true
  echo "planted cold-start hold-title intent" >&2
else
  echo "warn: no app data container; cold-start may auto sign-in to Stable" >&2
fi

VIDEO="${PREFIX}.mp4"
set +e
simctl_budget xcrun simctl io "${UDID}" recordVideo --codec=h264 "${VIDEO}" &
REC_PID=$!
set -e
if [[ -n "${REC_PID}" ]] && kill -0 "${REC_PID}" 2>/dev/null; then
  echo "recording ${VIDEO} (pid=${REC_PID})" >&2
else
  echo "warn: recordVideo failed to start (continuing with frames only)" >&2
  REC_PID=""
fi

# Brief delay so the recorder attaches before launch.
sleep 0.3
LAUNCH_OUT="$(simctl_budget xcrun simctl launch "${UDID}" "${BUNDLE_ID}" 2>&1 || true)"
echo "${LAUNCH_OUT}" >&2

# High-frequency early frames catch native splash #302D27 before first paint.
FRAME_INTERVAL_MS="${CAPTURE_COLD_FRAME_INTERVAL_MS:-250}"
FRAME_COUNT="${CAPTURE_COLD_FRAME_COUNT:-16}"
for ((i = 0; i < FRAME_COUNT; i++)); do
  FRAME="${PREFIX}-frame$(printf '%02d' "${i}").png"
  if simctl_budget xcrun simctl io "${UDID}" screenshot "${FRAME}" >/dev/null 2>&1 && [[ -s "${FRAME}" ]]; then
    echo "cold-start frame: ${FRAME}" >&2
    echo "frame.${i}=${FRAME}" >>"${MANIFEST_NOTE}"
  else
    echo "warn: cold-start frame ${i} failed" >&2
  fi
  # bash sleep accepts fractional seconds.
  sleep "$(awk "BEGIN { printf \"%.3f\", ${FRAME_INTERVAL_MS}/1000 }")"
done

ELAPSED_MS=$((FRAME_COUNT * FRAME_INTERVAL_MS))
REMAIN_MS=$((SECONDS_N * 1000 - ELAPSED_MS))
if [[ "${REMAIN_MS}" -gt 0 ]]; then
  sleep "$(awk "BEGIN { printf \"%.3f\", ${REMAIN_MS}/1000 }")"
fi

cleanup_recorder
trap - EXIT

if [[ -s "${VIDEO}" ]]; then
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
