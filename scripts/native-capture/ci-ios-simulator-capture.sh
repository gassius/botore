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

echo "expo prebuild --clean (ios)…" >&2
(
  cd "${REPO_ROOT}/apps/game"
  CI=1 pnpm exec expo prebuild --platform ios --clean
)

IOS_DIR="${REPO_ROOT}/apps/game/ios"
if [[ ! -d "${IOS_DIR}" ]]; then
  echo "error: apps/game/ios missing after prebuild" >&2
  exit 1
fi

WORKSPACE="$(find "${IOS_DIR}" -maxdepth 1 -name '*.xcworkspace' | head -n 1 || true)"
if [[ -z "${WORKSPACE}" || ! -d "${WORKSPACE}" ]]; then
  echo "error: no *.xcworkspace under apps/game/ios" >&2
  ls -la "${IOS_DIR}" >&2 || true
  exit 1
fi

# Scheme usually matches sanitized Expo name (Botore Game Client → BotoreGameClient).
SCHEME="${CAPTURE_IOS_SCHEME:-}"
if [[ -z "${SCHEME}" ]]; then
  SCHEME="$(
    xcodebuild -list -workspace "${WORKSPACE}" 2>/dev/null \
      | awk '/Schemes:/{f=1;next} f&&NF{print $1; exit}'
  )"
fi
if [[ -z "${SCHEME}" ]]; then
  SCHEME="BotoreGameClient"
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
export CAPTURE_IOS_UDID="${UDID}"

DERIVED="${IOS_DIR}/build"
rm -rf "${DERIVED}"
echo "xcodebuild Release (iphonesimulator, bundle-embedded)…" >&2
(
  cd "${IOS_DIR}"
  EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE}" \
    EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}" \
    EXPO_PUBLIC_DESIGN_CAPTURE_PAINT="${EXPO_PUBLIC_DESIGN_CAPTURE_PAINT:-}" \
    EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON="${EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON:-}" \
    EXPO_USE_COMMUNITY_AUTOLINKING=0 \
    xcodebuild \
    -workspace "$(basename "${WORKSPACE}")" \
    -scheme "${SCHEME}" \
    -configuration Release \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=${UDID}" \
    -derivedDataPath "${DERIVED}" \
    CODE_SIGNING_ALLOWED=NO \
    build
)

APP="$(find "${DERIVED}/Build/Products" -path '*/Release-iphonesimulator/*.app' -maxdepth 3 | head -n 1 || true)"
if [[ -z "${APP}" || ! -d "${APP}" ]]; then
  echo "error: Release-iphonesimulator .app not found under ${DERIVED}" >&2
  find "${DERIVED}/Build/Products" -maxdepth 4 -type d 2>/dev/null | head -n 40 >&2 || true
  exit 1
fi
echo "installing ${APP}" >&2
xcrun simctl uninstall "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl install "${UDID}" "${APP}"
xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null

echo "waiting for ${BUNDLE_ID}…" >&2
ready=0
for _ in $(seq 1 45); do
  # simctl spawn launches briefly; check installed + process list best-effort.
  if xcrun simctl get_app_container "${UDID}" "${BUNDLE_ID}" data >/dev/null 2>&1; then
    ready=1
    # Give RN/Expo a moment after cold launch.
    sleep "${CAPTURE_BOOT_SEC:-8}"
    break
  fi
  sleep 1
done
if [[ "${ready}" != "1" ]]; then
  echo "error: ${BUNDLE_ID} not installed/launchable on simulator" >&2
  exit 1
fi

# Re-launch to foreground in case install raced.
xcrun simctl terminate "${UDID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
xcrun simctl launch "${UDID}" "${BUNDLE_ID}" >/dev/null
sleep "${CAPTURE_BOOT_SEC:-6}"

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
missing=0
for raw in "${ROUTE_LIST[@]}"; do
  route="$(echo "${raw}" | xargs)"
  [[ -z "${route}" ]] && continue
  matches=( "${OUT_DIR}"/ios-*-"${route}".png )
  if [[ ! -e "${matches[0]:-}" ]]; then
    echo "error: missing capture PNG for route ${route} under ${OUT_DIR}" >&2
    missing=1
  else
    echo "ok: ${matches[0]}" >&2
  fi
done
if [[ "${missing}" != "0" ]]; then
  ls -la "${OUT_DIR}" >&2 || true
  exit 1
fi

echo "ci-ios-simulator-capture: done → ${OUT_DIR} device=${DEVICE_NAME}" >&2
