#!/usr/bin/env bash
# Non-gating UI/UX evidence: cold-start frame sequence + short video of
# native splash → first in-app paint (title / auth / garage).
#
# Usage: ios-cold-start-capture.sh [--out DIR] [--udid UDID] [--seconds N]
# Exit 0 even when individual media steps fail (caller should not gate CI).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
UDID="booted"
SECONDS_N="${CAPTURE_COLD_START_SEC:-8}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"

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
      sed -n '2,7p' "$0"
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

echo "ios-cold-start-capture: splash→title (non-gating) udid=${UDID} sec=${SECONDS_N}" >&2

xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 1

VIDEO="${PREFIX}.mp4"
REC_PID=""
set +e
xcrun simctl io "${UDID}" recordVideo --codec=h264 "${VIDEO}" &
REC_PID=$!
set -e
if [[ -n "${REC_PID}" ]] && kill -0 "${REC_PID}" 2>/dev/null; then
  echo "recording ${VIDEO} (pid=${REC_PID})" >&2
else
  echo "warn: recordVideo failed to start (continuing with frames only)" >&2
  REC_PID=""
fi

# Brief delay so the recorder attaches before launch.
sleep 0.4
LAUNCH_OUT="$(xcrun simctl launch "${UDID}" "${BUNDLE_ID}" 2>&1 || true)"
echo "${LAUNCH_OUT}" >&2

# Frame sequence: splash / transition / first in-app paint.
FRAME_INTERVAL="${CAPTURE_COLD_FRAME_INTERVAL_SEC:-1}"
FRAME_COUNT="${CAPTURE_COLD_FRAME_COUNT:-6}"
for ((i = 0; i < FRAME_COUNT; i++)); do
  FRAME="${PREFIX}-frame$(printf '%02d' "${i}").png"
  if xcrun simctl io "${UDID}" screenshot "${FRAME}" >/dev/null 2>&1 && [[ -s "${FRAME}" ]]; then
    echo "cold-start frame: ${FRAME}" >&2
    echo "frame.${i}=${FRAME}" >>"${MANIFEST_NOTE}"
  else
    echo "warn: cold-start frame ${i} failed" >&2
  fi
  sleep "${FRAME_INTERVAL}"
done

# Drain remaining record time if frames finished early.
ELAPSED=$((FRAME_COUNT * FRAME_INTERVAL))
if [[ "${ELAPSED}" -lt "${SECONDS_N}" ]]; then
  sleep $((SECONDS_N - ELAPSED))
fi

if [[ -n "${REC_PID}" ]]; then
  kill -INT "${REC_PID}" >/dev/null 2>&1 || true
  wait "${REC_PID}" >/dev/null 2>&1 || true
fi

if [[ -s "${VIDEO}" ]]; then
  echo "cold-start video: ${VIDEO}" >&2
  echo "video=${VIDEO}" >>"${MANIFEST_NOTE}"
  printf '%s\n' "${VIDEO}"
else
  echo "warn: cold-start video missing or empty" >&2
  # Prefer first successful frame as the stdout marker for callers.
  FIRST_FRAME="$(ls -1 "${PREFIX}"-frame*.png 2>/dev/null | head -n 1 || true)"
  if [[ -n "${FIRST_FRAME}" ]]; then
    printf '%s\n' "${FIRST_FRAME}"
  else
    printf '%s\n' "${MANIFEST_NOTE}"
  fi
fi
