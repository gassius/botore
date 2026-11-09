#!/usr/bin/env bash
# Record a short clip from a booted iOS Simulator via simctl io recordVideo.
# Usage: ios-record.sh [--out DIR] [--name LABEL] [--seconds N] [--route Route] [--mute] [--udid UDID]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
NAME=""
ROUTE=""
MUTE=""
PAINT=""
WEAPON=""
UDID="booted"
SECONDS_N="${CAPTURE_SECONDS:-8}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --name)
      NAME="$2"
      shift 2
      ;;
    --route)
      ROUTE="$2"
      shift 2
      ;;
    --mute)
      MUTE="1"
      shift
      ;;
    --paint)
      PAINT="$2"
      shift 2
      ;;
    --weapon)
      WEAPON="$2"
      shift 2
      ;;
    --seconds)
      SECONDS_N="$2"
      shift 2
      ;;
    --udid)
      UDID="$2"
      shift 2
      ;;
    -h | --help)
      sed -n '2,4p' "$0"
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

if [[ -n "${ROUTE}" ]]; then
  URL="$(capture_url_for_route "${ROUTE}" "${MUTE}" "${PAINT}" "${WEAPON}")"
  echo "opening ${URL}" >&2
  xcrun simctl openurl "${UDID}" "${URL}"
  sleep "${CAPTURE_SETTLE_SEC:-2}"
fi

LABEL="${NAME:-${ROUTE:-clip}}"
FILE="${OUT_DIR}/ios-$(stamp)-${LABEL}.mp4"

# simctl recordVideo runs until SIGINT; time-box with background + kill.
xcrun simctl io "${UDID}" recordVideo --codec=h264 "${FILE}" &
REC_PID=$!
sleep "${SECONDS_N}"
kill -INT "${REC_PID}" >/dev/null 2>&1 || true
wait "${REC_PID}" >/dev/null 2>&1 || true

printf '%s\n' "${FILE}"
