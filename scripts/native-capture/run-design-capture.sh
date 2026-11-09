#!/usr/bin/env bash
# Walk first-run routes and capture stills (+ optional short clips) on a live
# native Android emulator/device and/or iOS Simulator.
#
# Prerequisites:
#   - App installed and running with EXPO_PUBLIC_DESIGN_CAPTURE=1
#   - Android: adb device online
#   - iOS: booted Simulator (macOS only)
#
# Usage:
#   ./scripts/native-capture/run-design-capture.sh \
#     --platform android|ios|both \
#     [--out DIR] [--routes Stable,Replay] [--clips] [--mute]
#
# This is NOT a pixel-exact E2E layout test. Failures mean tooling/device
# problems, not UI diffs.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PLATFORM="android"
OUT_DIR="${DEFAULT_OUT_DIR}"
ROUTES_CSV=""
DO_CLIPS="0"
MUTE=""
TIP_SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --routes)
      ROUTES_CSV="$2"
      shift 2
      ;;
    --clips)
      DO_CLIPS="1"
      shift
      ;;
    --mute)
      MUTE="1"
      shift
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

OUT_DIR="$(ensure_out_dir "${OUT_DIR}")"
MANIFEST="${OUT_DIR}/manifest-$(stamp).txt"
: >"${MANIFEST}"
write_manifest_line "${MANIFEST}" tip_sha "${TIP_SHA}"
write_manifest_line "${MANIFEST}" platform "${PLATFORM}"
write_manifest_line "${MANIFEST}" design_capture "native-phone"
write_manifest_line "${MANIFEST}" web_preview "not-accepted"

ROUTES=()
if [[ -n "${ROUTES_CSV}" ]]; then
  IFS=',' read -r -a ROUTES <<<"${ROUTES_CSV}"
else
  while IFS= read -r r; do
    ROUTES+=("${r}")
  done < <(list_default_routes)
fi

capture_android_route() {
  local route="$1"
  local args=(--out "${OUT_DIR}" --route "${route}" --name "${route}")
  if [[ -n "${MUTE}" ]]; then args+=(--mute); fi
  local file
  file="$("${SCRIPT_DIR}/android-screencap.sh" "${args[@]}")"
  write_manifest_line "${MANIFEST}" "still.android.${route}" "${file}"
  echo "android still: ${file}"
  if [[ "${DO_CLIPS}" == "1" ]]; then
    local clip
    clip="$("${SCRIPT_DIR}/android-screenrecord.sh" "${args[@]}" --seconds "${CAPTURE_SECONDS:-6}")"
    write_manifest_line "${MANIFEST}" "clip.android.${route}" "${clip}"
    echo "android clip: ${clip}"
  fi
}

capture_ios_route() {
  local route="$1"
  local args=(--out "${OUT_DIR}" --route "${route}" --name "${route}")
  if [[ -n "${MUTE}" ]]; then args+=(--mute); fi
  local file
  file="$("${SCRIPT_DIR}/ios-screencap.sh" "${args[@]}")"
  write_manifest_line "${MANIFEST}" "still.ios.${route}" "${file}"
  echo "ios still: ${file}"
  if [[ "${DO_CLIPS}" == "1" ]]; then
    local clip
    clip="$("${SCRIPT_DIR}/ios-record.sh" "${args[@]}" --seconds "${CAPTURE_SECONDS:-6}")"
    write_manifest_line "${MANIFEST}" "clip.ios.${route}" "${clip}"
    echo "ios clip: ${clip}"
  fi
}

case "${PLATFORM}" in
  android)
    require_cmd adb
    for route in "${ROUTES[@]}"; do
      capture_android_route "${route}"
    done
    ;;
  ios)
    require_cmd xcrun
    for route in "${ROUTES[@]}"; do
      capture_ios_route "${route}"
    done
    ;;
  both)
    require_cmd adb
    for route in "${ROUTES[@]}"; do
      capture_android_route "${route}"
    done
    if command -v xcrun >/dev/null 2>&1; then
      for route in "${ROUTES[@]}"; do
        capture_ios_route "${route}"
      done
    else
      echo "warn: xcrun not found — skipping iOS captures" >&2
      write_manifest_line "${MANIFEST}" ios_skipped "xcrun-missing"
    fi
    ;;
  *)
    echo "error: --platform must be android|ios|both (got ${PLATFORM})" >&2
    exit 2
    ;;
esac

echo "manifest: ${MANIFEST}"
echo "${OUT_DIR}"
