#!/usr/bin/env bash
# Capture a PNG screenshot from a connected Android emulator/device via adb.
# Usage: android-screencap.sh [--out DIR] [--name LABEL] [--route Route] [--mute]
# Only the output file path is printed on stdout (for $(…) capture).
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
NAME=""
ROUTE=""
MUTE=""
PAINT=""
WEAPON=""
RANKING=""
FAIL_CLOSED=""

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
    --ranking)
      RANKING="$2"
      shift 2
      ;;
    --fail-closed)
      FAIL_CLOSED="1"
      shift
      ;;
    -h | --help)
      sed -n '2,5p' "$0"
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
android_assert_app_foreground "${PACKAGE_ANDROID}"

if [[ -n "${ROUTE}" || -n "${FAIL_CLOSED}" ]]; then
  URL="$(capture_url_for_route "${ROUTE:-Stable}" "${MUTE}" "${PAINT}" "${WEAPON}" "${RANKING}" "${FAIL_CLOSED}")"
  echo "opening ${URL}" >&2
  adb shell am start -a android.intent.action.VIEW -d "${URL}" >/dev/null
  # Settle UI after deep link (not a pixel assertion — just wait for paint).
  sleep "${CAPTURE_SETTLE_SEC:-2}"
  android_assert_app_foreground "${PACKAGE_ANDROID}"
fi

LABEL="${NAME:-${ROUTE:-screen}}"
FILE="${OUT_DIR}/android-$(stamp)-${LABEL}.png"
REMOTE="/sdcard/botore-capture.png"

adb shell screencap -p "${REMOTE}"
adb pull "${REMOTE}" "${FILE}" >/dev/null
adb shell rm -f "${REMOTE}" >/dev/null || true

printf '%s\n' "${FILE}"
