#!/usr/bin/env bash
# Shared helpers for native design-capture scripts (C7).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEFAULT_OUT_DIR="${REPO_ROOT}/artifacts/native-captures"
PACKAGE_ANDROID="com.botore.game"
BUNDLE_IOS="com.botore.game"
SCHEME_CAPTURE_PREFIX="botore://capture"

ensure_out_dir() {
  local out="${1:-$DEFAULT_OUT_DIR}"
  mkdir -p "${out}"
  printf '%s' "${out}"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "error: required command not found: ${cmd}" >&2
    exit 127
  fi
}

stamp() {
  date -u +%Y%m%dT%H%M%SZ
}

capture_url_for_route() {
  local route="$1"
  local mute="${2:-}"
  local paint="${3:-}"
  local weapon="${4:-}"
  local query=()
  if [[ "${mute}" == "1" || "${mute}" == "true" ]]; then
    query+=("mute=1")
  fi
  if [[ -n "${paint}" ]]; then
    query+=("paint=${paint}")
  fi
  if [[ -n "${weapon}" ]]; then
    query+=("weapon=${weapon}")
  fi
  if [[ ${#query[@]} -eq 0 ]]; then
    printf '%s/%s' "${SCHEME_CAPTURE_PREFIX}" "${route}"
  else
    local joined
    joined="$(IFS='&'; echo "${query[*]}")"
    printf '%s/%s?%s' "${SCHEME_CAPTURE_PREFIX}" "${route}" "${joined}"
  fi
}

# Optional welcome coverage for Stable/Customise (Petrol + axe/dagger).
# Controlled by CAPTURE_WELCOME=1; per-route overrides via CAPTURE_PAINT_* / CAPTURE_WEAPON_*.
welcome_paint_for_route() {
  local route="$1"
  if [[ "${CAPTURE_WELCOME:-0}" != "1" && "${CAPTURE_WELCOME:-0}" != "true" ]]; then
    return 0
  fi
  case "${route}" in
    Stable) printf '%s' "${CAPTURE_PAINT_STABLE:-petrol}" ;;
    Customise) printf '%s' "${CAPTURE_PAINT_CUSTOMISE:-petrol}" ;;
    *) ;;
  esac
}

welcome_weapon_for_route() {
  local route="$1"
  if [[ "${CAPTURE_WELCOME:-0}" != "1" && "${CAPTURE_WELCOME:-0}" != "true" ]]; then
    return 0
  fi
  case "${route}" in
    Stable) printf '%s' "${CAPTURE_WEAPON_STABLE:-axe}" ;;
    Customise) printf '%s' "${CAPTURE_WEAPON_CUSTOMISE:-dagger}" ;;
    *) ;;
  esac
}

list_default_routes() {
  printf '%s\n' Stable Customise Opponents ConfirmFight Replay FightResult Ranking
}

write_manifest_line() {
  local manifest="$1"
  local key="$2"
  local value="$3"
  printf '%s=%s\n' "${key}" "${value}" >>"${manifest}"
}

# Assert the Android package is running and resumed in the foreground.
# Status noise must go to stderr so $(screencap) only captures the file path.
android_assert_app_foreground() {
  local pkg="${1:-$PACKAGE_ANDROID}"
  local pid
  pid="$(adb shell pidof -s "${pkg}" 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "${pid}" ]]; then
    echo "error: package ${pkg} is not running (crashed / not started)" >&2
    adb logcat -d -t 80 '*:E' >&2 || true
    exit 1
  fi
  local focus
  focus="$(adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 'mResumedActivity' || true)"
  if [[ -z "${focus}" ]]; then
    # Older emulators use mFocusedActivity
    focus="$(adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 'mFocusedActivity' || true)"
  fi
  if [[ -n "${focus}" && "${focus}" != *"${pkg}"* ]]; then
    echo "error: ${pkg} not in foreground (pid=${pid}): ${focus}" >&2
    exit 1
  fi
  echo "android foreground ok: ${pkg} pid=${pid}" >&2
}
