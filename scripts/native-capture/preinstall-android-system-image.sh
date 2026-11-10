#!/usr/bin/env bash
# Pre-install the Android emulator system image with retries.
#
# reactivecircus/android-emulator-runner has no retry around sdkmanager, so a
# truncated Google CDN package fails the job with:
#   Error on ZipFile unknown archive
# before the capture script runs. Installing here (with wipe + backoff) makes
# the action's own install a no-op / quick success.
set -euo pipefail

API_LEVEL="${CAPTURE_API_LEVEL:-34}"
TARGET="${CAPTURE_ANDROID_TARGET:-default}"
ARCH="${CAPTURE_ANDROID_ARCH:-x86_64}"
PKG="system-images;android-${API_LEVEL};${TARGET};${ARCH}"
MAX_ATTEMPTS="${CAPTURE_SDK_INSTALL_ATTEMPTS:-3}"

SDKROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "${SDKROOT}" ]]; then
  for candidate in \
    "${HOME}/Android/Sdk" \
    /usr/local/lib/android/sdk \
    /usr/lib/android-sdk; do
    if [[ -d "${candidate}" ]]; then
      SDKROOT="${candidate}"
      break
    fi
  done
fi
if [[ -z "${SDKROOT}" || ! -d "${SDKROOT}" ]]; then
  echo "error: ANDROID_SDK_ROOT / ANDROID_HOME not set and no SDK found" >&2
  exit 1
fi
export ANDROID_SDK_ROOT="${SDKROOT}"
export ANDROID_HOME="${SDKROOT}"

find_sdkmanager() {
  local c
  for c in \
    "${SDKROOT}/cmdline-tools/latest/bin/sdkmanager" \
    "${SDKROOT}/cmdline-tools/bin/sdkmanager" \
    "${SDKROOT}/tools/bin/sdkmanager"; do
    if [[ -x "${c}" ]]; then
      printf '%s' "${c}"
      return 0
    fi
  done
  # Prefer a versioned cmdline-tools dir if present.
  local found
  found="$(find "${SDKROOT}/cmdline-tools" -type f -name sdkmanager 2>/dev/null | head -n 1 || true)"
  if [[ -n "${found}" && -x "${found}" ]]; then
    printf '%s' "${found}"
    return 0
  fi
  return 1
}

SDKMANAGER="$(find_sdkmanager || true)"
if [[ -z "${SDKMANAGER}" ]]; then
  echo "error: sdkmanager not found under ${SDKROOT}" >&2
  exit 1
fi

IMAGE_DIR="${SDKROOT}/system-images/android-${API_LEVEL}/${TARGET}/${ARCH}"

image_complete() {
  [[ -f "${IMAGE_DIR}/source.properties" && -f "${IMAGE_DIR}/system.img" ]]
}

wipe_image() {
  if [[ -d "${IMAGE_DIR}" ]]; then
    echo "wiping incomplete system image at ${IMAGE_DIR}" >&2
    rm -rf "${IMAGE_DIR}"
  fi
}

if image_complete; then
  echo "system image already complete: ${PKG}" >&2
  exit 0
fi

echo "preinstalling ${PKG} via ${SDKMANAGER} (up to ${MAX_ATTEMPTS} attempts)" >&2
attempt=1
while (( attempt <= MAX_ATTEMPTS )); do
  wipe_image
  set +e
  yes | "${SDKMANAGER}" --install "${PKG}" --channel=0
  status=$?
  set -e
  if (( status == 0 )) && image_complete; then
    echo "system image install ok on attempt ${attempt}: ${PKG}" >&2
    exit 0
  fi
  echo "warn: system image install attempt ${attempt}/${MAX_ATTEMPTS} failed (exit=${status})" >&2
  wipe_image
  if (( attempt == MAX_ATTEMPTS )); then
    break
  fi
  sleep $(( attempt * 5 ))
  attempt=$(( attempt + 1 ))
done

echo "error: failed to install ${PKG} after ${MAX_ATTEMPTS} attempts" >&2
exit 1
