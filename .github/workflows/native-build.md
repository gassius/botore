# Native builds (supersedes Cocos note)

The previous Cocos Creator native-build job is **obsolete**. Botore ships an
Expo / React Native client (`apps/game`).

## Design-review captures (C7)

Use the dispatch workflow and scripts documented in:

- `docs/architecture/native-design-captures.md`
- `.github/workflows/native-design-captures.yml`
- `scripts/native-capture/`
- `apps/game/eas.json` (`design-review` profile)

## Release / perf binaries (F12)

Phone performance measurement remains a **release** Android APK/AAB on a
physical device with `EXPO_PUBLIC_PERF_SAMPLE=1`. See
`docs/architecture/android-release-perf.md`.
