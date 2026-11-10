#!/usr/bin/env bash
# Cold-start frame sequence + short video: native splash #302D27 → launch-title
# silhouette composite (not AuthEntry).
#
# Holds launch-title via Documents botore-cold-start-intent.json (skips design-
# capture auto sign-in). Frames are extracted from the recorded MP4 with ffmpeg
# (~250ms / fps=8) so the first 1–2s after launch are covered — simctl screenshot
# polling is too slow on GHA and misses the splash (C7c PRR P1).
#
# recordVideo is NOT wrapped in the 20s simctl_budget; finalize with SIGINT (P2).
#
# Usage: ios-cold-start-capture.sh [--out DIR] [--udid UDID] [--seconds N]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
UDID="booted"
SECONDS_N="${CAPTURE_COLD_START_SEC:-8}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"
# Per-call budget for flaky simctl (seconds) — never applied to recordVideo.
SIMCTL_TIMEOUT_SEC="${CAPTURE_SIMCTL_TIMEOUT_SEC:-20}"
# Dense sampling of the first seconds after launch (~250ms → fps=8 covers more).
FRAME_FPS="${CAPTURE_COLD_FRAME_FPS:-8}"
FRAME_COUNT="${CAPTURE_COLD_FRAME_COUNT:-16}"

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
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

require_cmd xcrun
require_cmd ffmpeg
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

REC_PID=""
cleanup_recorder() {
  if [[ -n "${REC_PID}" ]]; then
    # recordVideo finalises cleanly on SIGINT (not SIGTERM from timeout).
    kill -INT "${REC_PID}" >/dev/null 2>&1 || true
    sleep 2
    kill -KILL "${REC_PID}" >/dev/null 2>&1 || true
    wait "${REC_PID}" >/dev/null 2>&1 || true
    REC_PID=""
  fi
}
trap cleanup_recorder EXIT

echo "ios-cold-start-capture: splash→title udid=${UDID} sec=${SECONDS_N} fps=${FRAME_FPS}" >&2

simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 0.5

# Ensure Documents exists, then plant hold-title marker (skip auto sign-in → LaunchTitle).
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
  rm -f "${DATA_DIR}/Documents/botore-design-capture-intent.json" || true
  echo "planted cold-start hold-title intent" >&2
else
  echo "warn: no app data container; cold-start may auto sign-in to Stable" >&2
fi

VIDEO="${PREFIX}.mp4"
# Do NOT wrap recordVideo in simctl_budget / timeout — SIGTERM truncates the MP4.
set +e
xcrun simctl io "${UDID}" recordVideo --codec=h264 "${VIDEO}" &
REC_PID=$!
set -e
if [[ -n "${REC_PID}" ]] && kill -0 "${REC_PID}" 2>/dev/null; then
  echo "recording ${VIDEO} (pid=${REC_PID}; no per-call timeout)" >&2
else
  echo "error: recordVideo failed to start" >&2
  REC_PID=""
  exit 1
fi

# Brief delay so the recorder attaches before launch.
sleep 0.5
LAUNCH_OUT="$(simctl_budget xcrun simctl launch "${UDID}" "${BUNDLE_ID}" 2>&1 || true)"
echo "${LAUNCH_OUT}" >&2

# Let splash → title play through; recorder keeps running (outer job budget only).
sleep "${SECONDS_N}"

cleanup_recorder
trap - EXIT

if [[ ! -s "${VIDEO}" ]]; then
  echo "error: cold-start video missing or empty: ${VIDEO}" >&2
  exit 1
fi
echo "cold-start video: ${VIDEO}" >&2
echo "video=${VIDEO}" >>"${MANIFEST_NOTE}"

# Extract dense frames from the MP4 (covers first 1–2s after launch).
TMP_FRAMES="$(mktemp -d "${OUT_DIR}/.cold-frames.XXXXXX")"
# ffmpeg 1-indexes; take first FRAME_COUNT frames at FRAME_FPS.
ffmpeg -y -hide_banner -loglevel error -i "${VIDEO}" \
  -vf "fps=${FRAME_FPS}" -frames:v "${FRAME_COUNT}" \
  "${TMP_FRAMES}/frame-%02d.png"
extracted=0
for ((i = 1; i <= FRAME_COUNT; i++)); do
  SRC="${TMP_FRAMES}/frame-$(printf '%02d' "${i}").png"
  if [[ -s "${SRC}" ]]; then
    DEST="${PREFIX}-frame$(printf '%02d' "$((i - 1))").png"
    mv "${SRC}" "${DEST}"
    echo "cold-start frame: ${DEST}" >&2
    echo "frame.$((i - 1))=${DEST}" >>"${MANIFEST_NOTE}"
    extracted=$((extracted + 1))
  fi
done
rm -rf "${TMP_FRAMES}"

if [[ "${extracted}" -lt 2 ]]; then
  echo "error: need ≥2 frames from ${VIDEO} (got ${extracted})" >&2
  exit 1
fi

printf '%s\n' "${VIDEO}"
