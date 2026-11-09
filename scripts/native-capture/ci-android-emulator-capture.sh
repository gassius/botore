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

export EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE:-1}"
export EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE:-Stable}"

echo "ci-android-emulator-capture: tip=$(git rev-parse --short HEAD 2>/dev/null || echo unknown) routes=${ROUTES}" >&2

# Expo CLI loads .env during createBundle*JsAndAssets — bake capture flags in.
cat >"${REPO_ROOT}/apps/game/.env" <<EOF
EXPO_PUBLIC_DESIGN_CAPTURE=${EXPO_PUBLIC_DESIGN_CAPTURE}
EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}
EOF

if [[ ! -d "${REPO_ROOT}/apps/game/android" ]]; then
  echo "expo prebuild (android)…" >&2
  (
    cd "${REPO_ROOT}/apps/game"
    pnpm exec expo prebuild --platform android --non-interactive
  )
fi

node "${SCRIPT_DIR}/patch-android-ci-signing.mjs"

echo "assembleRelease (bundle-embedded, debug-signed)…" >&2
(
  cd "${REPO_ROOT}/apps/game/android"
  # Ensure Gradle/Metro see the same public env the .env file carries.
  EXPO_PUBLIC_DESIGN_CAPTURE="${EXPO_PUBLIC_DESIGN_CAPTURE}" \
    EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE="${EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE}" \
    ./gradlew assembleRelease \
    -PreactNativeArchitectures="${ARCHS}" \
    --no-daemon \
    --build-cache
)

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
