#!/usr/bin/env bash
# Cold-start frame sequence + short video: native splash #302D27 → launch-title
# silhouette composite (not AuthEntry).
#
# Holds launch-title via Documents botore-cold-start-intent.json (skips design-
# capture auto sign-in).
#
# PRIMARY frames: timed `simctl io screenshot` burst from launch (~250ms for
# ~SECONDS_N). GHA paravirt `recordVideo` often yields multi-frame but
# content-identical splash strips (AppleM2ScalerParavirtDriver) — those must
# NOT feed assert-cold-start-transition. Video is kept as an artifact only.
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
FRAME_INTERVAL_MS="${CAPTURE_COLD_FRAME_INTERVAL_MS:-250}"
# Cap so a hung screenshot loop cannot burn the outer job budget.
FRAME_MAX="${CAPTURE_COLD_FRAME_COUNT:-32}"

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
      sed -n '2,16p' "$0"
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

log_video_probe() {
  local video="$1"
  if [[ ! -s "${video}" ]]; then
    echo "warn: cold-start video missing for ffprobe" >&2
    return 0
  fi
  if ! command -v ffprobe >/dev/null 2>&1; then
    echo "warn: ffprobe unavailable; skipping duration/frame probe for ${video}" >&2
    return 0
  fi
  local probe duration frames size
  size="$(wc -c <"${video}" | tr -d ' ')"
  probe="$(
    ffprobe -v error -select_streams v:0 \
      -count_frames \
      -show_entries stream=duration,nb_frames,nb_read_frames,avg_frame_rate,codec_name \
      -show_entries format=duration,size \
      -of json "${video}" 2>/dev/null || true
  )"
  duration="$(
    printf '%s' "${probe}" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  print("?"); raise SystemExit
fmt=(d.get("format") or {})
streams=d.get("streams") or [{}]
s=streams[0] if streams else {}
print(s.get("duration") or fmt.get("duration") or "?")
' 2>/dev/null || echo '?'
  )"
  frames="$(
    printf '%s' "${probe}" | python3 -c '
import json,sys
try:
  d=json.load(sys.stdin)
except Exception:
  print("?"); raise SystemExit
streams=d.get("streams") or [{}]
s=streams[0] if streams else {}
print(s.get("nb_read_frames") or s.get("nb_frames") or "?")
' 2>/dev/null || echo '?'
  )"
  echo "cold-start ffprobe: file=${video} bytes=${size} duration_s=${duration} frames=${frames}" >&2
  echo "ffprobe.duration_s=${duration}" >>"${MANIFEST_NOTE}"
  echo "ffprobe.frames=${frames}" >>"${MANIFEST_NOTE}"
  echo "ffprobe.bytes=${size}" >>"${MANIFEST_NOTE}"
}

# PRIMARY: wall-clock screenshot burst from launch (not recordVideo frames).
screenshot_burst_from_launch() {
  local i=0
  local frame
  local interval_s
  local end_at
  local next_at
  local now
  local wait_s
  interval_s="$(awk "BEGIN { printf \"%.3f\", ${FRAME_INTERVAL_MS}/1000 }")"
  end_at="$(python3 -c "import time; print(time.time() + float('${SECONDS_N}'))")"
  echo "cold-start screenshot burst (primary): sec=${SECONDS_N} interval_ms=${FRAME_INTERVAL_MS} max=${FRAME_MAX}" >&2

  # First frame ASAP — native splash is brief.
  frame="${PREFIX}-frame$(printf '%02d' "${i}").png"
  if simctl_budget xcrun simctl io "${UDID}" screenshot "${frame}" >/dev/null 2>&1 \
    && [[ -s "${frame}" ]]; then
    echo "cold-start frame: ${frame}" >&2
    echo "frame.${i}=${frame}" >>"${MANIFEST_NOTE}"
  else
    echo "warn: cold-start screenshot ${i} failed" >&2
    rm -f "${frame}" >/dev/null 2>&1 || true
  fi
  i=1
  next_at="$(python3 -c "import time; print(time.time() + float('${interval_s}'))")"

  while python3 -c "import time,sys; sys.exit(0 if time.time() < float('${end_at}') else 1)"; do
    if [[ "${i}" -ge "${FRAME_MAX}" ]]; then
      break
    fi
    now="$(python3 -c 'import time; print(time.time())')"
    wait_s="$(python3 -c "print(max(0.0, float('${next_at}') - float('${now}')))")"
    if awk "BEGIN { exit !(${wait_s} > 0.001) }"; then
      sleep "${wait_s}"
    fi
    frame="${PREFIX}-frame$(printf '%02d' "${i}").png"
    if simctl_budget xcrun simctl io "${UDID}" screenshot "${frame}" >/dev/null 2>&1 \
      && [[ -s "${frame}" ]]; then
      echo "cold-start frame: ${frame}" >&2
      echo "frame.${i}=${frame}" >>"${MANIFEST_NOTE}"
    else
      echo "warn: cold-start screenshot ${i} failed" >&2
      rm -f "${frame}" >/dev/null 2>&1 || true
    fi
    i=$((i + 1))
    next_at="$(python3 -c "print(float('${next_at}') + float('${interval_s}'))")"
  done
}

echo "ios-cold-start-capture: splash→title udid=${UDID} sec=${SECONDS_N} (screenshot-primary)" >&2

simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 0.5
plant_hold_title || true

VIDEO="${PREFIX}.mp4"
# Optional artifact only — do NOT extract assert frames from this on GHA paravirt.
set +e
xcrun simctl io "${UDID}" recordVideo --codec=h264 "${VIDEO}" &
REC_PID=$!
set -e
if [[ -n "${REC_PID}" ]] && kill -0 "${REC_PID}" 2>/dev/null; then
  echo "recording ${VIDEO} (pid=${REC_PID}; artifact only, frames from screenshots)" >&2
else
  echo "warn: recordVideo failed to start; continuing with screenshot burst" >&2
  REC_PID=""
fi

# Brief delay so the recorder attaches before launch (screenshots still primary).
sleep 0.3
LAUNCH_OUT="$(simctl_budget xcrun simctl launch "${UDID}" "${BUNDLE_ID}" 2>&1 || true)"
echo "${LAUNCH_OUT}" >&2

screenshot_burst_from_launch

cleanup_recorder
trap - EXIT

if [[ -s "${VIDEO}" ]]; then
  echo "cold-start video: ${VIDEO}" >&2
  echo "video=${VIDEO}" >>"${MANIFEST_NOTE}"
  log_video_probe "${VIDEO}"
else
  echo "warn: cold-start video missing or empty (screenshots are the gate)" >&2
fi

extracted=0
for f in "${PREFIX}"-frame*.png; do
  [[ -e "${f}" ]] || continue
  [[ -s "${f}" ]] || continue
  extracted=$((extracted + 1))
done

if [[ "${extracted}" -lt 2 ]]; then
  echo "error: need ≥2 screenshot frames for splash→title assert (got ${extracted})" >&2
  exit 1
fi

echo "cold-start primary frames: ${extracted} screenshots under ${PREFIX}-frame*.png" >&2
printf '%s\n' "${VIDEO}"
