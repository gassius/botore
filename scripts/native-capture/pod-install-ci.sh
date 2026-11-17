#!/usr/bin/env bash
# Run `pod install` for apps/game/ios with one targeted retry on the known
# CocoaPods + pnpm "pathname contains null byte" crash (#12798).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${REPO_ROOT}/apps/game/ios"

if [[ ! -f "${IOS_DIR}/Podfile" ]]; then
  echo "error: missing ${IOS_DIR}/Podfile — run expo prebuild first" >&2
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods gem (pod) not on PATH" >&2
  exit 1
fi

node "${SCRIPT_DIR}/patch-ios-cocoapods-null-byte.mjs"

run_pod_install() {
  (
    cd "${IOS_DIR}"
    # Prefer lockfile-respecting deploy mode; fall back to a normal install.
    pod install --deployment 2>/dev/null || pod install
  )
}

LOG="$(mktemp)"
cleanup() { rm -f "${LOG}"; }
trap cleanup EXIT

set +e
run_pod_install >"${LOG}" 2>&1
status=$?
set -e
cat "${LOG}"

if [[ "${status}" -eq 0 ]]; then
  exit 0
fi

if ! grep -q 'pathname contains null byte' "${LOG}"; then
  echo "error: pod install failed (not the CocoaPods null-byte path)" >&2
  exit "${status}"
fi

echo "warn: CocoaPods null-byte crash — cleaning generated Pods project and retrying once" >&2
rm -rf "${IOS_DIR}/Pods/Pods.xcodeproj" "${IOS_DIR}/Pods/Manifest.lock" 2>/dev/null || true
# Keep downloaded specs/cache; only regenerate the project that crashed.
run_pod_install
