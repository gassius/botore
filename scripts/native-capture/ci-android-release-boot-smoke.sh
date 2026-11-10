#!/usr/bin/env bash
# Release-boot smoke — assert apps/game release APK stays alive past splash.
#
# Invoked as ONE LINE by reactivecircus/android-emulator-runner (that action
# runs each `script:` newline in a separate `sh -c`, so multi-line bodies break).
#
# Intentionally does NOT set EXPO_PUBLIC_DESIGN_CAPTURE — that path skips C12
# silent auth. This smoke bakes Supabase public env so silent first-launch →
# collectPlatformProof runs (the Hermes fatal regression from a missing
# @tubinex/expo-game-services require).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

PACKAGE="${SMOKE_ANDROID_PACKAGE:-${PACKAGE_ANDROID}}"
ARCHS="${SMOKE_RN_ARCHITECTURES:-x86_64}"
HOLD_SEC="${SMOKE_BOOT_HOLD_SEC:-12}"
export_sentry_skip_upload_for_capture

echo "ci-android-release-boot-smoke: tip=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" >&2

# Workspace packages export dist/ only — Metro createBundleReleaseJsAndAssets
# resolves @botore/replay (etc.) through main/exports → ./dist/index.js.
echo "build @botore/game workspace deps (dist/)…" >&2
pnpm --filter @botore/game^... run build

# Bake public Supabase env so createAuthClient() is 'supabase' and C12 silent
# auth runs. Values may be placeholders — network failure must show session
# error chrome, not crash. Never enable DESIGN_CAPTURE or DEV scaffold here.
SMOKE_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-https://example.supabase.co}"
SMOKE_SUPABASE_ANON="${EXPO_PUBLIC_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.smoke}"
cat >"${REPO_ROOT}/apps/game/.env" <<EOF
EXPO_PUBLIC_SUPABASE_URL=${SMOKE_SUPABASE_URL}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${SMOKE_SUPABASE_ANON}
EXPO_PUBLIC_CRASH_REPORTING=0
SENTRY_DISABLE_AUTO_UPLOAD=true
EOF
unset EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD || true
unset EXPO_PUBLIC_DESIGN_CAPTURE || true

export EXPO_USE_COMMUNITY_AUTOLINKING="${EXPO_USE_COMMUNITY_AUTOLINKING:-0}"
echo "expo prebuild --clean (android)…" >&2
(
  cd "${REPO_ROOT}/apps/game"
  CI=1 pnpm exec expo prebuild --platform android --clean
)

if ! grep -q 'useExpoModules()' "${REPO_ROOT}/apps/game/android/settings.gradle"; then
  echo "error: apps/game/android/settings.gradle missing useExpoModules()" >&2
  exit 1
fi

node "${SCRIPT_DIR}/patch-android-ci-signing.mjs"

echo "assembleRelease (bundle-embedded, debug-signed)…" >&2
(
  cd "${REPO_ROOT}/apps/game/android"
  EXPO_PUBLIC_SUPABASE_URL="${SMOKE_SUPABASE_URL}" \
    EXPO_PUBLIC_SUPABASE_ANON_KEY="${SMOKE_SUPABASE_ANON}" \
    EXPO_PUBLIC_CRASH_REPORTING=0 \
    EXPO_USE_COMMUNITY_AUTOLINKING=0 \
    SENTRY_DISABLE_AUTO_UPLOAD=true \
    ./gradlew assembleRelease \
    -PreactNativeArchitectures="${ARCHS}" \
    -Pandroid.kotlinVersion=1.9.25 \
    --no-daemon \
    --build-cache
)

APK="$(find "${REPO_ROOT}/apps/game/android/app/build/outputs/apk/release" -name '*.apk' | head -n 1 || true)"
if [[ -z "${APK}" || ! -f "${APK}" ]]; then
  echo "error: release APK not found under app/build/outputs/apk/release" >&2
  exit 1
fi

echo "installing ${APK}" >&2
adb logcat -c || true
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
  adb logcat -d | grep -E 'FATAL EXCEPTION|ReactNativeJS|SoLoader|AndroidRuntime' >&2 || true
  exit 1
fi

echo "holding ${HOLD_SEC}s past splash (assert stay-alive)…" >&2
sleep "${HOLD_SEC}"

if ! adb shell pidof -s "${PACKAGE}" 2>/dev/null | tr -d '\r' | grep -q '[0-9]'; then
  echo "error: ${PACKAGE} exited during boot hold (splash→close regression)" >&2
  adb logcat -d | grep -E 'FATAL EXCEPTION|ReactNativeJS|SoLoader|AndroidRuntime|tryLoadExpoGameServices|collectPlatformProof|unknown module' >&2 || true
  exit 1
fi

android_assert_app_foreground "${PACKAGE}"

# Fail if the known Hermes fatal string appears even if the process somehow survived.
if adb logcat -d | grep -F 'Requiring unknown module "undefined"' >/dev/null 2>&1; then
  echo "error: logcat contains Hermes unknown-module fatal" >&2
  adb logcat -d | grep -E 'FATAL EXCEPTION|ReactNativeJS|unknown module' >&2 || true
  exit 1
fi

echo "ci-android-release-boot-smoke: OK (${PACKAGE} alive past splash)" >&2
