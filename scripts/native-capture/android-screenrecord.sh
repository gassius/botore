#!/usr/bin/env bash
# Record a short MP4 clip from a connected Android emulator/device via adb.
# Usage: android-screenrecord.sh [--out DIR] [--name LABEL] [--seconds N] [--route Route] [--mute]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
NAME=""
ROUTE=""
MUTE=""
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
    --seconds)
      SECONDS_N="$2"
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

require_cmd adb
OUT_DIR="$(ensure_out_dir "${OUT_DIR}")"

if [[ -n "${ROUTE}" ]]; then
  URL="$(capture_url_for_route "${ROUTE}" "${MUTE}")"
  echo "opening ${URL}"
  adb shell am start -a android.intent.action.VIEW -d "${URL}" >/dev/null
  sleep "${CAPTURE_SETTLE_SEC:-2}"
fi

LABEL="${NAME:-${ROUTE:-clip}}"
FILE="${OUT_DIR}/android-$(stamp)-${LABEL}.mp4"
REMOTE="/sdcard/botore-capture.mp4"

# adb screenrecord max is 180s; keep design-review clips short.
adb shell screenrecord --time-limit "${SECONDS_N}" "${REMOTE}"
adb pull "${REMOTE}" "${FILE}" >/dev/null
adb shell rm -f "${REMOTE}" >/dev/null || true

echo "${FILE}"
