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
# Android emulator (single line for android-emulator-runner)
bash scripts/native-capture/ci-android-emulator-capture.sh

# iOS Simulator (macOS + Xcode; Release / phone-size device)
bash scripts/native-capture/ci-ios-simulator-capture.sh
```

iOS routes: `simctl launch` + Documents intent file (avoid cold `simctl openurl`
— iOS 18 SpringBoard “Open in …?” sheets were captured instead of the app).
Non-gating splash→title: `ios-cold-start-capture.sh`.

Not a pixel-exact E2E suite. Web preview is not acceptance.
