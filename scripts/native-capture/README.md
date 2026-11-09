# Native design captures

Scripts for Android / iOS phone stills and short clips used in UI supervisor
design review (ClickUp C7).

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

Not a pixel-exact E2E suite. Web preview is not acceptance.
