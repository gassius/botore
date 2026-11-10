#!/usr/bin/env bash
# C7 — CI job for iOS Simulator design captures (macOS + Xcode).
#
# Clean Expo prebuild → Release simulator build (JS bundle embedded) →
# install/launch on a phone-size iPhone Simulator → Stable/Customise/Replay PNGs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

OUT_DIR="${CAPTURE_OUT_DIR:-${REPO_ROOT}/artifacts/native-captures}"
ROUTES="${CAPTURE_ROUTES:-Stable,Customise,Replay}"
CLIPS="${CAPTURE_CLIPS:-false}"
BUNDLE_ID="${CAPTURE_IOS_BUNDLE:-${BUNDLE_IOS}}"
# Prefer a modern phone-size device; fall back across Xcode runtimes on GHA.
DEVICE_CANDIDATES="${CAPTURE_IOS_DEVICE:-iPhone 16,iPhone 16 Plus,iPhone 15,iPhone 15 Pro,iPhone 14}"
# Optional welcome coverage (non-gating art ask): Petrol + axe/dagger on Stable/Customise.
WELCOME="${CAPTURE_WELCOME:-1}"

export EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE:-1}"
export EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE:-Stable}"
export EXPO_USE_COMMUNITY_AUTOLINKING="${EXPO_USE_COMMUNITY_AUTOLINKING:-0}"
export_sentry_skip_upload_for_capture
# Bake welcome defaults into the Release bundle when enabled.
if [[ "${WELCOME}" == "1" || "${WELCOME}" == "true" ]]; then
  export EXPO_PUBLIC_DESIGN_CAPTURE_PAINT="${EXPO_PUBLIC_DESIGN_CAPTURE_PAINT:-petrol}"
  export EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON="${EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON:-axe}"
fi

require_cmd xcrun
require_cmd xcodebuild

TIP="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "ci-ios-simulator-capture: tip=${TIP} routes=${ROUTES}" >&2

echo "build @botore/game workspace deps (dist/)…" >&2
pnpm --filter @botore/game^... run build

cat >"${REPO_ROOT}/apps/game/.env" <<EOF
EXPO_PUBLIC_DESIGN_CAPTURE=${EXPO_PUBLIC_DESIGN_CAPTURE}
EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}
EXPO_PUBLIC_DESIGN_CAPTURE_PAINT=${EXPO_PUBLIC_DESIGN_CAPTURE_PAINT:-}
EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON=${EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON:-}
EOF

IOS_DIR="${REPO_ROOT}/apps/game/ios"
if [[ "${CAPTURE_IOS_SKIP_PREBUILD:-0}" == "1" || "${CAPTURE_IOS_SKIP_PREBUILD:-0}" == "true" ]]; then
  echo "skipping expo prebuild (CAPTURE_IOS_SKIP_PREBUILD=1; workflow cached Pods/DerivedData)" >&2
  if [[ ! -d "${IOS_DIR}" ]]; then
    echo "error: apps/game/ios missing — prebuild step did not run" >&2
    exit 1
  fi
else
  echo "expo prebuild --clean (ios)…" >&2
  (
    cd "${REPO_ROOT}/apps/game"
    CI=1 pnpm exec expo prebuild --platform ios --clean
  )
fi

if [[ ! -d "${IOS_DIR}" ]]; then
  echo "error: apps/game/ios missing after prebuild" >&2
  exit 1
fi

# CI cleartext ATS for local Supabase (no-op when already patched).
node "${SCRIPT_DIR}/patch-ios-ci-ats.mjs" || true

# Prefer cached Pods; always run pod install so the lockfile is respected.
if [[ -f "${IOS_DIR}/Podfile" ]]; then
  echo "pod install…" >&2
  (
    cd "${IOS_DIR}"
    if command -v pod >/dev/null 2>&1; then
      pod install --deployment 2>/dev/null || pod install
    else
      echo "warn: CocoaPods gem missing; relying on Expo prebuild pod install" >&2
    fi
  )
fi

WORKSPACE="$(find "${IOS_DIR}" -maxdepth 1 -name '*.xcworkspace' ! -name 'Pods.xcworkspace' | head -n 1 || true)"
if [[ -z "${WORKSPACE}" || ! -d "${WORKSPACE}" ]]; then
  echo "error: no app *.xcworkspace under apps/game/ios" >&2
  ls -la "${IOS_DIR}" >&2 || true
  exit 1
fi

WORKSPACE_BASE="$(basename "${WORKSPACE}" .xcworkspace)"
# Prefer BotoreGameClient (Expo: Botore Game Client). Never take the first
# xcodebuild -list entry — CocoaPods lists boost/hermes/etc. first.
SCHEME="${CAPTURE_IOS_SCHEME:-}"
SCHEME_LIST="$(
  xcodebuild -list -workspace "${WORKSPACE}" 2>/dev/null \
    | awk '/Schemes:/{f=1;next} /^$/{f=0} f&&NF{gsub(/^[[:space:]]+|[[:space:]]+$/,""); print}'
)"
echo "available schemes:" >&2
echo "${SCHEME_LIST}" | sed 's/^/  /' >&2 || true

if [[ -z "${SCHEME}" ]]; then
  if echo "${SCHEME_LIST}" | grep -qx 'BotoreGameClient'; then
    SCHEME='BotoreGameClient'
  elif echo "${SCHEME_LIST}" | grep -qx "${WORKSPACE_BASE}"; then
    SCHEME="${WORKSPACE_BASE}"
  else
    # First non-Pods-looking scheme (skip common pod library schemes).
    SCHEME="$(
      echo "${SCHEME_LIST}" \
        | grep -Eiv '^(Pods-|boost|hermes|React|Yoga|fmt|glog|SocketRocket|FBLazyVector|RCT|DoubleConversion)' \
        | head -n 1 || true
    )"
  fi
fi
if [[ -z "${SCHEME}" ]]; then
  echo "error: could not resolve app scheme for ${WORKSPACE_BASE}" >&2
  exit 1
fi
if ! echo "${SCHEME_LIST}" | grep -qx "${SCHEME}"; then
  echo "error: scheme '${SCHEME}' not in workspace scheme list" >&2
  exit 1
fi
echo "using workspace=$(basename "${WORKSPACE}") scheme=${SCHEME}" >&2

pick_ios_device() {
  local available
  available="$(xcrun simctl list devices available 2>/dev/null || true)"
  IFS=',' read -r -a CANDS <<<"${DEVICE_CANDIDATES}"
  local cand
  for cand in "${CANDS[@]}"; do
    cand="$(echo "${cand}" | xargs)"
    [[ -z "${cand}" ]] && continue
    if echo "${available}" | grep -F "${cand} (" >/dev/null 2>&1; then
      printf '%s' "${cand}"
      return 0
    fi
  done
  # Last resort: first available iPhone that is not an iPad / SE if possible.
  local fallback
  fallback="$(
    echo "${available}" \
      | grep -E '^\s+iPhone [^S].*\([A-F0-9-]{36}\)' \
      | head -n 1 \
      | sed -E 's/^[[:space:]]+//; s/ \([A-F0-9-]{36}.*//' \
      | sed -E 's/ \(Shutdown\)| \(Booted\)| \(Unavailable[^)]*\)//' \
      | xargs
  )"
  if [[ -n "${fallback}" ]]; then
    printf '%s' "${fallback}"
    return 0
  fi
  return 1
}

DEVICE_NAME="$(pick_ios_device || true)"
if [[ -z "${DEVICE_NAME}" ]]; then
  echo "error: no phone-size iPhone Simulator device available" >&2
  xcrun simctl list devices available >&2 || true
  exit 1
fi
export CAPTURE_DEVICE="${CAPTURE_DEVICE:-${DEVICE_NAME}}"
echo "simulator device: ${DEVICE_NAME}" >&2

echo "booting Simulator ${DEVICE_NAME}…" >&2
# open -a Simulator helps CoreSimulator on GHA; ignore failure if already up.
open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "${DEVICE_NAME}" >/dev/null 2>&1 || true
# Wait until booted.
booted=0
for _ in $(seq 1 60); do
  state="$(xcrun simctl list devices | grep -F "${DEVICE_NAME} (" | grep -F '(Booted)' || true)"
  if [[ -n "${state}" ]]; then
    booted=1
    break
  fi
  xcrun simctl boot "${DEVICE_NAME}" >/dev/null 2>&1 || true
  sleep 2
done
if [[ "${booted}" != "1" ]]; then
  echo "error: failed to boot ${DEVICE_NAME}" >&2
  xcrun simctl list devices >&2 || true
  exit 1
fi
UDID="$(xcrun simctl list devices | grep -F "${DEVICE_NAME} (" | grep -F '(Booted)' | sed -E 's/.*\(([A-F0-9-]{36})\).*/\1/' | head -n 1)"
if [[ -z "${UDID}" ]]; then
  echo "error: could not resolve UDID for ${DEVICE_NAME}" >&2
  exit 1
fi
echo "booted udid=${UDID}" >&2
# Wait for SpringBoard (not just Booted) so screenshots are not a blank framebuffer.
xcrun simctl bootstatus "${UDID}" -b >/dev/null 2>&1 || true
osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1 || true
export CAPTURE_IOS_UDID="${UDID}"

# RN/Expo codegen writes to ios/build/generated — do NOT use ios/build as
# -derivedDataPath or ReactCodegen looks for files that land under DerivedSources.
DERIVED="${IOS_DIR}/DerivedData"
PRODUCTS_DIR="${DERIVED}/Build/Products/Release-iphonesimulator"
rm -rf "${DERIVED}"
# Keep ios/build/generated if a prior step produced it; only clear stale DD.
mkdir -p "${IOS_DIR}/build"
echo "xcodebuild Release (iphonesimulator, scheme=${SCHEME}, derivedData=${DERIVED})…" >&2
(
  cd "${IOS_DIR}"
  export RCT_NO_LAUNCH_PACKAGER=1
  export EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE}"
  export EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}"
  export EXPO_PUBLIC_DESIGN_CAPTURE_PAINT="${EXPO_PUBLIC_DESIGN_CAPTURE_PAINT:-}"
  export EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON="${EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON:-}"
  export EXPO_USE_COMMUNITY_AUTOLINKING=0
  # Ensure React Native script phases find node in GHA PATH.
  export NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
  xcodebuild \
    -workspace "$(basename "${WORKSPACE}")" \
    -scheme "${SCHEME}" \
    -configuration Release \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=${UDID}" \
    -derivedDataPath "${DERIVED}" \
    CODE_SIGNING_ALLOWED=NO \
    ONLY_ACTIVE_ARCH=YES \
    build
)

# Explicit product path first; then search DerivedData for the app .app.
APP="${PRODUCTS_DIR}/${SCHEME}.app"
if [[ ! -d "${APP}" ]]; then
  APP="$(find "${PRODUCTS_DIR}" -maxdepth 1 -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "${APP}" || ! -d "${APP}" ]]; then
  APP="$(find "${DERIVED}" -path '*/Release-iphonesimulator/*.app' -type d 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "${APP}" || ! -d "${APP}" ]]; then
  echo "error: Release-iphonesimulator .app not found (scheme=${SCHEME})" >&2
  echo "expected: ${PRODUCTS_DIR}/${SCHEME}.app" >&2
  find "${DERIVED}/Build/Products" -maxdepth 4 \( -type d -o -name '*.app' \) 2>/dev/null | head -n 80 >&2 || true
  exit 1
fi
echo "built app: ${APP}" >&2
# Confirm Release embedded the JS bundle (Hermes bytecode or plain).
JSBUNDLE="$(find "${APP}" -name '*.jsbundle' | head -n 1 || true)"
if [[ -z "${JSBUNDLE}" || ! -s "${JSBUNDLE}" ]]; then
  echo "error: no embedded *.jsbundle inside ${APP}" >&2
  find "${APP}" -maxdepth 3 -type f | head -n 80 >&2 || true
  exit 1
fi
echo "embedded bundle: ${JSBUNDLE} ($(wc -c <"${JSBUNDLE}" | xargs) bytes)" >&2

echo "installing ${APP}" >&2
xcrun simctl uninstall "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl install "${UDID}" "${APP}"

# Expensive splash→title capture. Default off on pull_request (C7b PRR P2);
# enable with CAPTURE_COLD_START=1 (workflow_dispatch / C7c AC).
# Hard wall-clock budget so a hung simctl cannot burn the 90-minute job.
if [[ "${CAPTURE_COLD_START:-0}" == "1" || "${CAPTURE_COLD_START:-0}" == "true" ]]; then
  echo "cold-start splash→title capture (budget ${CAPTURE_COLD_START_BUDGET_SEC:-120}s)…" >&2
  COLD_BUDGET="${CAPTURE_COLD_START_BUDGET_SEC:-120}"
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout "${COLD_BUDGET}" "${SCRIPT_DIR}/ios-cold-start-capture.sh" \
      --out "${OUT_DIR}" \
      --udid "${UDID}" \
      --seconds "${CAPTURE_COLD_START_SEC:-8}"
    cold_rc=$?
  else
    "${SCRIPT_DIR}/ios-cold-start-capture.sh" \
      --out "${OUT_DIR}" \
      --udid "${UDID}" \
      --seconds "${CAPTURE_COLD_START_SEC:-8}"
    cold_rc=$?
  fi
  set -e
  if [[ "${cold_rc}" -ne 0 ]]; then
    echo "warn: cold-start capture exited ${cold_rc} (continuing; stills remain the gate)" >&2
  elif ! node "${SCRIPT_DIR}/assert-cold-start-transition.mjs" \
    --platform ios \
    --out "${OUT_DIR}"; then
    echo "warn: cold-start transition assert failed (continuing)" >&2
  fi
else
  echo "cold-start skipped (CAPTURE_COLD_START=${CAPTURE_COLD_START:-0})" >&2
fi

echo "smoke-launch ${BUNDLE_ID}…" >&2
LAUNCH_OUT="$(xcrun simctl launch "${UDID}" "${BUNDLE_ID}" 2>&1 || true)"
echo "${LAUNCH_OUT}" >&2
APP_PID="$(echo "${LAUNCH_OUT}" | sed -nE 's/.*: ([0-9]+)$/\1/p' | tail -n 1)"
if [[ -z "${APP_PID}" ]]; then
  echo "error: simctl launch did not return a PID for ${BUNDLE_ID}" >&2
  xcrun simctl spawn "${UDID}" log show --last 2m --style compact 2>/dev/null | tail -n 80 >&2 || true
  exit 1
fi
echo "launched pid=${APP_PID}; waiting for first paint…" >&2
sleep "${CAPTURE_BOOT_SEC:-12}"
# Confirm process still alive (crashes yield black/identical stills).
if ! xcrun simctl spawn "${UDID}" launchctl print "system/${BUNDLE_ID}" >/dev/null 2>&1 \
  && ! xcrun simctl spawn "${UDID}" launchctl list 2>/dev/null | grep -F "${BUNDLE_ID}" >/dev/null; then
  # launchctl print paths differ across runtimes; fall back to host-side ps via simctl.
  if ! xcrun simctl spawn "${UDID}" sh -c "ps -A | grep -F '${BUNDLE_ID}' | grep -v grep" >/dev/null 2>&1; then
    echo "warn: could not confirm ${BUNDLE_ID} still running after boot wait (continuing; route stills assert uniqueness)" >&2
  fi
fi

node "${SCRIPT_DIR}/check-capture-env.mjs" --platform ios

CLIP_ARGS=()
if [[ "${CLIPS}" == "true" || "${CLIPS}" == "1" ]]; then
  CLIP_ARGS+=(--clips)
fi

# Welcome coverage: Stable=Petrol+axe, Customise=Petrol+dagger (Replay unchanged).
export CAPTURE_WELCOME="${WELCOME}"

"${SCRIPT_DIR}/run-design-capture.sh" \
  --platform ios \
  --out "${OUT_DIR}" \
  --routes "${ROUTES}" \
  ${CLIP_ARGS[@]+"${CLIP_ARGS[@]}"}

IFS=',' read -r -a ROUTE_LIST <<<"${ROUTES}"
TRIMMED_ROUTES=()
for raw in "${ROUTE_LIST[@]}"; do
  route="$(echo "${raw}" | xargs)"
  [[ -z "${route}" ]] && continue
  TRIMMED_ROUTES+=("${route}")
done
# Pixel-diff assert (SHA-only lets status-bar clock ticks false-pass).
if ! node "${SCRIPT_DIR}/assert-distinct-stills.mjs" \
  --platform ios \
  --out "${OUT_DIR}" \
  --routes "$(IFS=','; echo "${TRIMMED_ROUTES[*]}")" \
  --min-pct "${CAPTURE_MIN_DIFF_PCT:-0.5}"; then
  ls -la "${OUT_DIR}" >&2 || true
  xcrun simctl spawn "${UDID}" log show --last 3m --style compact 2>/dev/null | tail -n 120 >&2 || true
  exit 1
fi

echo "ci-ios-simulator-capture: done → ${OUT_DIR} device=${DEVICE_NAME}" >&2
