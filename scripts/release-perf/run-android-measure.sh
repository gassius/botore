#!/usr/bin/env bash
# Capture BotorePerf JSON from a physical Android (or emulator) running a
# release-perf APK. Does not invent frame numbers — exits non-zero if no
# BotorePerf line appears.
#
# Prerequisites:
#   - adb + device
#   - APK built from tip with EAS profile `release-perf` (EXPO_PUBLIC_PERF_SAMPLE=1)
#     and live Supabase public env for sealed-fight envelope (preferred)
#
# Usage:
#   ./scripts/release-perf/run-android-measure.sh \
#     --pass-id sound-on-warm \
#     --load-kind warm \
#     [--require-envelope live_sealed] \
#     [--out-dir artifacts/release-perf] \
#     [--timeout-sec 180]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PACKAGE_ANDROID="${PACKAGE_ANDROID:-com.botore.game}"
PASS_ID=""
LOAD_KIND=""
REQUIRE_ENVELOPE=""
OUT_DIR="${REPO_ROOT}/artifacts/release-perf"
TIMEOUT_SEC=180
CLEAR_LOGCAT=1

usage() {
  sed -n '2,18p' "$0" | tr -d '#'
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pass-id) PASS_ID="${2:-}"; shift 2 ;;
    --load-kind) LOAD_KIND="${2:-}"; shift 2 ;;
    --require-envelope) REQUIRE_ENVELOPE="${2:-}"; shift 2 ;;
    --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --timeout-sec) TIMEOUT_SEC="${2:-}"; shift 2 ;;
    --no-clear-logcat) CLEAR_LOGCAT=0; shift ;;
    -h|--help) usage ;;
    *) echo "error: unknown arg: $1" >&2; usage ;;
  esac
done

if [[ -z "${PASS_ID}" ]]; then
  echo "error: --pass-id is required (e.g. sound-on-warm)" >&2
  exit 2
fi
if [[ -n "${LOAD_KIND}" && "${LOAD_KIND}" != "warm" && "${LOAD_KIND}" != "cold" ]]; then
  echo "error: --load-kind must be warm or cold" >&2
  exit 2
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 127
  fi
}

require_cmd adb
require_cmd node
require_cmd date

mkdir -p "${OUT_DIR}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEVICE_SERIAL="$(adb get-serialno 2>/dev/null || true)"
if [[ -z "${DEVICE_SERIAL}" || "${DEVICE_SERIAL}" == "unknown" ]]; then
  echo "error: no adb device serial (attach a phone / start an emulator)" >&2
  adb devices -l >&2 || true
  exit 1
fi

DEVICE_JSON="${OUT_DIR}/device-${DEVICE_SERIAL}-${STAMP}.json"
{
  echo "{"
  echo "  \"serial\": \"${DEVICE_SERIAL}\","
  echo "  \"capturedAt\": \"${STAMP}\","
  echo "  \"getprop\": {"
  echo "    \"ro.product.manufacturer\": \"$(adb shell getprop ro.product.manufacturer | tr -d '\r')\","
  echo "    \"ro.product.model\": \"$(adb shell getprop ro.product.model | tr -d '\r')\","
  echo "    \"ro.build.version.release\": \"$(adb shell getprop ro.build.version.release | tr -d '\r')\","
  echo "    \"ro.build.version.sdk\": \"$(adb shell getprop ro.build.version.sdk | tr -d '\r')\","
  echo "    \"ro.product.board\": \"$(adb shell getprop ro.product.board | tr -d '\r')\","
  echo "    \"ro.hardware\": \"$(adb shell getprop ro.hardware | tr -d '\r')\","
  echo "    \"ro.sf.lcd_density\": \"$(adb shell getprop ro.sf.lcd_density | tr -d '\r')\""
  echo "  }"
  echo "}"
} >"${DEVICE_JSON}"

LOGCAT_PATH="${OUT_DIR}/logcat-${PASS_ID}-${STAMP}.txt"
PASS_JSON="${OUT_DIR}/pass-${PASS_ID}-${STAMP}.json"

echo "device serial: ${DEVICE_SERIAL}"
echo "writing device props → ${DEVICE_JSON}"
echo "capturing logcat → ${LOGCAT_PATH}"
echo "Play→END the representative replay in the release-perf APK (${PACKAGE_ANDROID})."
echo "Waiting up to ${TIMEOUT_SEC}s for a BotorePerf line…"

if [[ "${CLEAR_LOGCAT}" == "1" ]]; then
  adb logcat -c || true
fi

# Stream logcat until BotorePerf appears or timeout.
set +e
timeout "${TIMEOUT_SEC}" adb logcat -v time '*:S' ReactNativeJS:V ReactNative:V BotorePerf:V >"${LOGCAT_PATH}" 2>&1 &
LOGCAT_PID=$!

DEADLINE=$((SECONDS + TIMEOUT_SEC))
FOUND=0
while (( SECONDS < DEADLINE )); do
  if grep -q 'BotorePerf' "${LOGCAT_PATH}" 2>/dev/null; then
    FOUND=1
    break
  fi
  if ! kill -0 "${LOGCAT_PID}" 2>/dev/null; then
    break
  fi
  sleep 1
done

kill "${LOGCAT_PID}" 2>/dev/null || true
wait "${LOGCAT_PID}" 2>/dev/null || true
set -e

# Also dump a short buffer in case the stream filter missed the tag.
adb logcat -d -v time | grep -F 'BotorePerf' >>"${LOGCAT_PATH}" || true

if [[ "${FOUND}" != "1" ]] && ! grep -q 'BotorePerf' "${LOGCAT_PATH}"; then
  echo "error: no BotorePerf line within ${TIMEOUT_SEC}s — see ${LOGCAT_PATH}" >&2
  echo "hint: confirm the APK was built with EAS profile release-perf (EXPO_PUBLIC_PERF_SAMPLE=1)" >&2
  exit 1
fi

PARSE_ARGS=(--input "${LOGCAT_PATH}" --out "${PASS_JSON}" --pass-id "${PASS_ID}")
if [[ -n "${LOAD_KIND}" ]]; then
  PARSE_ARGS+=(--load-kind "${LOAD_KIND}")
fi
if [[ -n "${REQUIRE_ENVELOPE}" ]]; then
  PARSE_ARGS+=(--require-envelope "${REQUIRE_ENVELOPE}")
fi

node "${SCRIPT_DIR}/parse-botore-perf.mjs" "${PARSE_ARGS[@]}"
echo "pass record → ${PASS_JSON}"
echo "attach ${LOGCAT_PATH}, ${PASS_JSON}, and ${DEVICE_JSON} on the ClickUp R1 task."
