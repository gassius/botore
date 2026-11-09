#!/usr/bin/env bash
# Capture a PNG screenshot from a booted iOS Simulator via simctl.
# Usage: ios-screencap.sh [--out DIR] [--name LABEL] [--route Route] [--mute] [--udid UDID]
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

OUT_DIR="${DEFAULT_OUT_DIR}"
NAME=""
ROUTE=""
MUTE=""
UDID="booted"

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
  URL="$(capture_url_for_route "${ROUTE}" "${MUTE}")"
  echo "opening ${URL}"
  xcrun simctl openurl "${UDID}" "${URL}"
  sleep "${CAPTURE_SETTLE_SEC:-2}"
fi

LABEL="${NAME:-${ROUTE:-screen}}"
FILE="${OUT_DIR}/ios-$(stamp)-${LABEL}.png"
xcrun simctl io "${UDID}" screenshot "${FILE}"
echo "${FILE}"
