# Native design captures

Scripts for Android / iOS phone stills and short clips used in UI supervisor
design review (ClickUp C7 / C7b).

Full guide: [`docs/architecture/native-design-captures.md`](../../docs/architecture/native-design-captures.md)

```bash
node scripts/native-capture/check-capture-env.mjs --platform android --tools-only
./scripts/native-capture/run-design-capture.sh --platform android
```

CI entrypoints:

```bash
# Android emulator live fight (single line for android-emulator-runner)
bash scripts/native-capture/ci-live-fight-android-capture.sh

# iOS Simulator live fight (macOS + Xcode + Colima/Supabase)
bash scripts/native-capture/ci-live-fight-ios-capture.sh

# Design stills only (optional local)
bash scripts/native-capture/ci-ios-simulator-capture.sh
```

iOS routes: `simctl launch` + Documents intent file (avoid cold `simctl openurl`
— iOS 18 SpringBoard “Open in …?” sheets were captured instead of the app).
Splash→title: `ios-cold-start-capture.sh` / `android-cold-start-capture.sh`
(budgeted; hold-title intent skips auto sign-in). Assert with
`assert-cold-start-transition.mjs`.

Not a pixel-exact E2E suite. Web preview is not acceptance.
