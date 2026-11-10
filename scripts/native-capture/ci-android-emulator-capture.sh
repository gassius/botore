#!/usr/bin/env bash
# C7 — single-entry CI job for Android emulator design captures.
#
# Invoked as ONE LINE by reactivecircus/android-emulator-runner (that action
# runs each `script:` newline in a separate `sh -c`, so multi-line bodies break).
#
# Builds a JS-bundle-embedded release APK (debug-signed), installs it, asserts
# the app is alive, then walks routes with scripts/native-capture/*.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

OUT_DIR="${CAPTURE_OUT_DIR:-${REPO_ROOT}/artifacts/native-captures}"
ROUTES="${CAPTURE_ROUTES:-Stable,Customise,Replay}"
CLIPS="${CAPTURE_CLIPS:-false}"
PACKAGE="${CAPTURE_ANDROID_PACKAGE:-${PACKAGE_ANDROID}}"
ARCHS="${CAPTURE_RN_ARCHITECTURES:-x86_64}"
export CAPTURE_DEVICE="${CAPTURE_DEVICE:-pixel_6}"

export EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE:-1}"
export EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE:-Stable}"
export_sentry_skip_upload_for_capture

echo "ci-android-emulator-capture: tip=$(git rev-parse --short HEAD 2>/dev/null || echo unknown) routes=${ROUTES}" >&2

# Workspace packages export dist/ only — Metro createBundleReleaseJsAndAssets
# resolves @botore/replay (etc.) through main/exports → ./dist/index.js.
echo "build @botore/game workspace deps (dist/)…" >&2
pnpm --filter @botore/game^... run build

# Expo CLI loads .env during createBundle*JsAndAssets — bake capture flags in.
cat >"${REPO_ROOT}/apps/game/.env" <<EOF
EXPO_PUBLIC_DESIGN_CAPTURE=${EXPO_PUBLIC_DESIGN_CAPTURE}
EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}
EOF

# Always clean-prebuild so settings.gradle keeps useExpoModules() +
# expo-modules-autolinking (RN community autolinking emits expo.core.*).
export EXPO_USE_COMMUNITY_AUTOLINKING="${EXPO_USE_COMMUNITY_AUTOLINKING:-0}"
echo "expo prebuild --clean (android)…" >&2
(
  cd "${REPO_ROOT}/apps/game"
  CI=1 pnpm exec expo prebuild --platform android --clean
)

# Sanity: Expo settings must call useExpoModules (not community-only path).
if ! grep -q 'useExpoModules()' "${REPO_ROOT}/apps/game/android/settings.gradle"; then
  echo "error: apps/game/android/settings.gradle missing useExpoModules()" >&2
  exit 1
fi

node "${SCRIPT_DIR}/patch-android-ci-signing.mjs"

echo "assembleRelease (bundle-embedded, debug-signed)…" >&2
(
  cd "${REPO_ROOT}/apps/game/android"
  # Ensure Gradle/Metro see the same public env the .env file carries.
  EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE}" \
    EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}" \
    EXPO_USE_COMMUNITY_AUTOLINKING=0 \
    ./gradlew assembleRelease \
    -PreactNativeArchitectures="${ARCHS}" \
    -Pandroid.kotlinVersion=1.9.25 \
    --no-daemon \
    --build-cache
)

# Fail fast if PackageList still points at nonexistent expo.core.ExpoModulesPackage.
PACKAGE_LIST="$(find "${REPO_ROOT}/apps/game/android" -path '*/generated/autolinking/*/PackageList.java' | head -n 1 || true)"
if [[ -n "${PACKAGE_LIST}" ]]; then
  if grep -q 'expo\.core\.ExpoModulesPackage' "${PACKAGE_LIST}"; then
    echo "error: ${PACKAGE_LIST} imports expo.core.ExpoModulesPackage (RN CLI autolinking)" >&2
    echo "expected expo.modules.ExpoModulesPackage from expo-modules-autolinking" >&2
    head -n 80 "${PACKAGE_LIST}" >&2 || true
    exit 1
  fi
  echo "PackageList ok: ${PACKAGE_LIST}" >&2
fi

APK="$(find "${REPO_ROOT}/apps/game/android/app/build/outputs/apk/release" -name '*.apk' | head -n 1 || true)"
if [[ -z "${APK}" || ! -f "${APK}" ]]; then
  echo "error: release APK not found under app/build/outputs/apk/release" >&2
  exit 1
fi
echo "installing ${APK}" >&2
adb install -r "${APK}"

adb shell am force-stop "${PACKAGE}" >/dev/null 2>&1 || true
adb shell monkey -p "${PACKAGE}" -c android.intent.category.LAUNCHER 1 >/dev/null

echo "waiting for ${PACKAGE} process…" >&2
booted=0
for _ in $(seq 1 45); do
  if adb shell pidof -s "${PACKAGE}" 2>/dev/null | tr -d '\r' | grep -q '[0-9]'; then
    booted=1
    break
  fi
  sleep 1
done
if [[ "${booted}" != "1" ]]; then
  echo "error: ${PACKAGE} did not start after install" >&2
  adb logcat -d -t 120 '*:E' >&2 || true
  exit 1
fi
sleep "${CAPTURE_BOOT_SEC:-6}"
android_assert_app_foreground "${PACKAGE}"

node "${SCRIPT_DIR}/check-capture-env.mjs" --platform android

CLIP_ARGS=()
if [[ "${CLIPS}" == "true" || "${CLIPS}" == "1" ]]; then
  CLIP_ARGS+=(--clips)
fi

"${SCRIPT_DIR}/run-design-capture.sh" \
  --platform android \
  --out "${OUT_DIR}" \
  --routes "${ROUTES}" \
  ${CLIP_ARGS[@]+"${CLIP_ARGS[@]}"}

# Fail unless every requested route produced a PNG (gasnet: if-no-files-found:error).
IFS=',' read -r -a ROUTE_LIST <<<"${ROUTES}"
missing=0
for raw in "${ROUTE_LIST[@]}"; do
  route="$(echo "${raw}" | xargs)"
  [[ -z "${route}" ]] && continue
  matches=( "${OUT_DIR}"/android-*-"${route}".png )
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

echo "ci-android-emulator-capture: done → ${OUT_DIR}" >&2
