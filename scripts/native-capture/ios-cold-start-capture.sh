#!/usr/bin/env bash
# Cold-start frame sequence: native splash #302D27 → launch-title silhouette
# (not AuthEntry).
#
# Holds launch-title via Documents botore-cold-start-intent.json (skips design-
# capture auto sign-in).
#
# PRIMARY frames: timed `simctl io screenshot` burst that starts at/before
# `simctl launch` returns. On GHA each screenshot is ~2s, so we:
#   - launch in the background (do not block the first shot on launch return)
#   - never start recordVideo on the critical path (it delayed splash capture)
#   - burst for CAPTURE_COLD_START_SEC wall-clock at max speed (no artificial
#     250ms sleeps when each shot already costs ~2s)
#
# Usage: ios-cold-start-capture.sh [--out DIR] [--udid UDID] [--seconds N]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
UDID="booted"
# ~2s/screenshot on GHA → default 24s aims for ~10–12 frames covering splash→title.
SECONDS_N="${CAPTURE_COLD_START_SEC:-24}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"
SIMCTL_TIMEOUT_SEC="${CAPTURE_SIMCTL_TIMEOUT_SEC:-20}"
FRAME_MAX="${CAPTURE_COLD_FRAME_COUNT:-16}"

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

echo "ios-cold-start-capture: splash→title udid=${UDID} sec=${SECONDS_N} max_frames=${FRAME_MAX} (screenshot @ launch)" >&2

simctl_budget xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
sleep 0.3
plant_hold_title || true

LAUNCH_LOG="$(mktemp "${OUT_DIR}/.cold-launch.XXXXXX.log")"
# Launch in the background so the first screenshot is not blocked on simctl
# returning (GHA often takes several seconds after the process is already up).
set +e
xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >"${LAUNCH_LOG}" 2>&1 &
LAUNCH_PID=$!
set -e
echo "cold-start launch kicked (pid=${LAUNCH_PID}; screenshots start immediately)" >&2

# Tiny yield so the launch syscall is in flight, then shoot as fast as possible.
sleep 0.05

end_at="$(python3 -c "import time; print(time.time() + float('${SECONDS_N}'))")"
echo "cold-start screenshot burst: wall_sec=${SECONDS_N} max=${FRAME_MAX} (no inter-shot sleep)" >&2
i=0
while python3 -c "import time,sys; sys.exit(0 if time.time() < float('${end_at}') else 1)"; do
  if [[ "${i}" -ge "${FRAME_MAX}" ]]; then
    break
  fi
  frame="${PREFIX}-frame$(printf '%02d' "${i}").png"
  # No simctl_budget/timeout wrapper — keep the critical path as fast as possible.
  if xcrun simctl io "${UDID}" screenshot "${frame}" >/dev/null 2>&1 \
    && [[ -s "${frame}" ]]; then
    echo "cold-start frame: ${frame}" >&2
    echo "frame.${i}=${frame}" >>"${MANIFEST_NOTE}"
  else
    echo "warn: cold-start screenshot ${i} failed" >&2
    rm -f "${frame}" >/dev/null 2>&1 || true
  fi
  i=$((i + 1))
done

# Collect launch output once screenshots are done (do not fail the burst on it).
set +e
wait "${LAUNCH_PID}" 2>/dev/null
launch_rc=$?
set -e
if [[ -s "${LAUNCH_LOG}" ]]; then
  echo "cold-start launch log (rc=${launch_rc}):" >&2
  cat "${LAUNCH_LOG}" >&2 || true
fi
rm -f "${LAUNCH_LOG}" >/dev/null 2>&1 || true

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
# Emit first frame path for callers that expect a path on stdout (video optional).
printf '%s\n' "${PREFIX}-frame00.png"
