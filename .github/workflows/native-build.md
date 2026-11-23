# Native builds (supersedes Cocos note)

The previous Cocos Creator native-build job is **obsolete**. Botore ships an
Expo / React Native client (`apps/game`).

## Design-review captures (C7)

Native captures are **opt-in** (label `run-native-captures` + UI paths,
`workflow_dispatch`, or nightly). Per-push cheap stills use web preview
(`.github/workflows/web-preview-screenshots.yml`) — not native acceptance.

- `docs/architecture/native-design-captures.md`
- `.github/workflows/native-design-captures.yml`
- `.github/workflows/web-preview-screenshots.yml`
- `scripts/native-capture/`
- `scripts/web-preview-capture/`
- `apps/game/eas.json` (`design-review` profile)

## Release boot smoke (launch stay-alive)

PR / main workflow that builds a **non–design-capture** `assembleRelease` APK,
installs it on an Android emulator, and asserts `com.botore.game` stays running
past the splash (C12 silent-auth path). See:

- `.github/workflows/android-release-boot-smoke.yml`
- `scripts/native-capture/ci-android-release-boot-smoke.sh`

## Release / perf binaries (F12)

Phone performance measurement remains a **release** Android APK/AAB on a
physical device with `EXPO_PUBLIC_PERF_SAMPLE=1`. See
`docs/architecture/android-release-perf.md`.
