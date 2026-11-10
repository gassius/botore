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
BATTLE_ID=""
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
    --battle-id)
      BATTLE_ID="$2"
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
  local battle_id="$5"
  local data_dir
  data_dir="$(xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data 2>/dev/null || true)"
  if [[ -z "${data_dir}" || ! -d "${data_dir}" ]]; then
    echo "warn: app data container not ready for intent file" >&2
    return 1
  fi
  mkdir -p "${data_dir}/Documents"
  # Matches apps/game/src/design-capture/readCaptureIntentFile.ts
  # Escape with JSON.stringify so workflow_dispatch route/paint/weapon cannot break JSON.
  local mute_flag="false"
  if [[ "${mute}" == "1" || "${mute}" == "true" ]]; then mute_flag="true"; fi
  CAPTURE_INTENT_ROUTE="${route}" \
    CAPTURE_INTENT_PAINT="${paint}" \
    CAPTURE_INTENT_WEAPON="${weapon}" \
    CAPTURE_INTENT_MUTE="${mute_flag}" \
    CAPTURE_INTENT_BATTLE_ID="${battle_id}" \
    node -e '
      const o = {
        route: process.env.CAPTURE_INTENT_ROUTE || null,
        paintId: process.env.CAPTURE_INTENT_PAINT || null,
        weaponId: process.env.CAPTURE_INTENT_WEAPON || null,
        mute: process.env.CAPTURE_INTENT_MUTE === "true",
        battleId: process.env.CAPTURE_INTENT_BATTLE_ID || null,
      };
      if (!o.paintId) o.paintId = null;
      if (!o.weaponId) o.weaponId = null;
      if (!o.mute) o.mute = null;
      if (!o.battleId) o.battleId = null;
      process.stdout.write(JSON.stringify(o) + "\n");
    ' >"${data_dir}/Documents/botore-design-capture-intent.json"
  echo "wrote capture intent → ${data_dir}/Documents/botore-design-capture-intent.json" >&2
  return 0
}

# iOS 18 Simulator shows SpringBoard "Open in …?" for custom-scheme
# `simctl openurl` when the app is not already foreground — our stills were
# that dialog, not Stable/Customise/Replay. Prefer Documents intent + launch.
ensure_app_data_container() {
  if xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data >/dev/null 2>&1; then
    return 0
  fi
  xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 2
  xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep 1
}

dismiss_open_in_alert_if_any() {
  # Best-effort: if a prior openurl left the confirmation sheet up, dismiss it.
  osascript >/dev/null 2>&1 <<'APPLESCRIPT' || true
tell application "Simulator" to activate
delay 0.2
tell application "System Events"
  if exists process "Simulator" then
    tell process "Simulator"
      try
        if exists button "Open" of window 1 then
          click button "Open" of window 1
        end if
      end try
      try
        if exists button "Cancel" of window 1 then
          click button "Cancel" of window 1
        end if
      end try
    end tell
  end if
end tell
APPLESCRIPT
}

if [[ -n "${ROUTE}" ]]; then
  echo "launching ${BUNDLE_ID} for route=${ROUTE} (intent file; no openurl)" >&2
  xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  dismiss_open_in_alert_if_any
  ensure_app_data_container
  if ! write_capture_intent_file "${ROUTE}" "${PAINT}" "${WEAPON}" "${MUTE}" "${BATTLE_ID}"; then
    echo "error: could not write capture intent file for ${ROUTE}" >&2
    exit 1
  fi
  LAUNCH_OUT="$(xcrun simctl launch "${UDID}" "${BUNDLE_ID}" 2>&1 || true)"
  echo "${LAUNCH_OUT}" >&2
  APP_PID="$(echo "${LAUNCH_OUT}" | sed -nE 's/.*: ([0-9]+)$/\1/p' | tail -n 1)"
  if [[ -z "${APP_PID}" ]]; then
    echo "error: simctl launch did not return a PID for ${BUNDLE_ID}" >&2
    exit 1
  fi
  # Auth auto-sign-in + intent file poll + FirstRunShell route paint.
  sleep "${CAPTURE_IOS_COLD_SEC:-${CAPTURE_SETTLE_SEC:-16}}"
  # Re-write intent in case Documents was recreated, then bring app forward.
  write_capture_intent_file "${ROUTE}" "${PAINT}" "${WEAPON}" "${MUTE}" "${BATTLE_ID}" || true
  xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
  sleep "${CAPTURE_SETTLE_SEC:-5}"
  dismiss_open_in_alert_if_any
fi

LABEL="${NAME:-${ROUTE:-screen}}"
FILE="${OUT_DIR}/ios-$(stamp)-${LABEL}.png"
# Bring Simulator forward so the framebuffer is composited on GHA.
osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1 || true
dismiss_open_in_alert_if_any
xcrun simctl io "${UDID}" screenshot "${FILE}"
if [[ ! -s "${FILE}" ]]; then
  echo "error: empty screenshot ${FILE}" >&2
  exit 1
fi
printf '%s\n' "${FILE}"
