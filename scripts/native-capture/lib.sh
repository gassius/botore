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
  if [[ "${mute}" == "1" || "${mute}" == "true" ]]; then
    printf '%s/%s?mute=1' "${SCHEME_CAPTURE_PREFIX}" "${route}"
  else
    printf '%s/%s' "${SCHEME_CAPTURE_PREFIX}" "${route}"
  fi
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
