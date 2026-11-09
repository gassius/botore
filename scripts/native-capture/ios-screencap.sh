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
PAINT=""
WEAPON=""
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
    --paint)
      PAINT="$2"
      shift 2
      ;;
    --weapon)
      WEAPON="$2"
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
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"

write_capture_intent_file() {
  local route="$1"
  local paint="$2"
  local weapon="$3"
  local mute="$4"
  local data_dir
  data_dir="$(xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
  if [[ -z "${data_dir}" || ! -d "${data_dir}" ]]; then
    echo "warn: app data container not ready for intent file" >&2
    return 1
  fi
  mkdir -p "${data_dir}/Documents"
  # Matches apps/game/src/design-capture/readCaptureIntentFile.ts
  local paint_json="null" weapon_json="null" mute_json="null"
  if [[ -n "${paint}" ]]; then paint_json="\"${paint}\""; fi
  if [[ -n "${weapon}" ]]; then weapon_json="\"${weapon}\""; fi
  if [[ "${mute}" == "1" || "${mute}" == "true" ]]; then mute_json="true"; fi
  printf '{"route":"%s","paintId":%s,"weaponId":%s,"mute":%s}\n' \
    "${route}" "${paint_json}" "${weapon_json}" "${mute_json}" \
    >"${data_dir}/Documents/botore-design-capture-intent.json"
  echo "wrote capture intent → ${data_dir}/Documents/botore-design-capture-intent.json" >&2
  return 0
}

# Cold-start each route: write Documents intent file + openurl so GarageRoot
# arms Linking before FirstRunShell mounts (warm openurl alone left every
# still on Stable — Replay only differed by the status-bar clock).
if [[ -n "${ROUTE}" ]]; then
  URL="$(capture_url_for_route "${ROUTE}" "${MUTE}" "${PAINT}" "${WEAPON}")"
  echo "opening ${URL} (cold-start + intent file)" >&2
  xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  # Launch once so the data container exists, then plant the intent file.
  xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 2
  xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  write_capture_intent_file "${ROUTE}" "${PAINT}" "${WEAPON}" "${MUTE}" || true
  if ! xcrun simctl openurl "${UDID}" "${URL}"; then
    echo "error: simctl openurl failed for ${URL}" >&2
    exit 1
  fi
  # Auth auto-sign-in + intent file read + FirstRunShell mount + route paint.
  sleep "${CAPTURE_IOS_COLD_SEC:-${CAPTURE_SETTLE_SEC:-14}}"
  # Re-deliver once the shell is mounted (Linking 'url' event) + refresh file.
  write_capture_intent_file "${ROUTE}" "${PAINT}" "${WEAPON}" "${MUTE}" || true
  echo "re-opening ${URL} (warm)" >&2
  xcrun simctl openurl "${UDID}" "${URL}" >/dev/null || true
  sleep "${CAPTURE_SETTLE_SEC:-4}"
fi

LABEL="${NAME:-${ROUTE:-screen}}"
FILE="${OUT_DIR}/ios-$(stamp)-${LABEL}.png"
# Bring Simulator forward so the framebuffer is composited on GHA.
osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1 || true
xcrun simctl io "${UDID}" screenshot "${FILE}"
if [[ ! -s "${FILE}" ]]; then
  echo "error: empty screenshot ${FILE}" >&2
  exit 1
fi
printf '%s\n' "${FILE}"
