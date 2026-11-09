# Native design captures (C7)

Repeatable **Android / iOS phone** screenshots and short clips for UI supervisor
design review. Web / Expo web preview is **not** acceptance evidence.

Ticket: [C7 · Native build captures for design review](https://app.clickup.com/t/1amjtrey13t).

**Done when:** each client PR that touches visible screens can attach native
phone captures of those screens.

This is **not** a pixel-exact E2E layout test suite. Captures are human-reviewed
evidence; tooling failures mean device/build problems, not UI diffs.

## What to attach on a client PR

1. Stills (PNG) and/or short clips (MP4/GIF) from a **native** Android emulator
   or device. Add iOS Simulator captures when a Mac is available.
2. Label each file with tip SHA, platform, and route (Stable / Customise / …).
3. Say explicitly when a clip is DEV fixture / sound-off — never claim live
   fight or web preview as native.
4. Prefer the routes your PR actually changes; full first-run walks are fine
   for integrated tips.

Suggested layout when dropping into the Project store:

```text
media/<pr-or-feature>/
  01-stable-android.png
  02-customise-android.png
  m01-replay-android.mp4
  README.md   # tip SHA · platform · sound on/off · honesty notes
```

## Fast local path (preferred for unblocking design review)

### 1. Run a native build with capture mode

From the monorepo root (Android example):

```bash
cd apps/game
EXPO_PUBLIC_DESIGN_CAPTURE=1 \
EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=Stable \
pnpm exec expo run:android
```

iOS (macOS):

```bash
cd apps/game
EXPO_PUBLIC_DESIGN_CAPTURE=1 \
EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=Stable \
pnpm exec expo run:ios
```

Capture mode (`EXPO_PUBLIC_DESIGN_CAPTURE=1`):

- Auto DEV sign-in (skips the auth form)
- Honors `botore://capture/<Route>` deep links
- Optional initial route via `EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE`

Never ship store builds with capture mode enabled.

### 2. Capture stills / clips

```bash
# Tooling check (Android adb / iOS xcrun)
node scripts/native-capture/check-capture-env.mjs --platform android

# Walk default first-run routes on a live Android emulator/device
./scripts/native-capture/run-design-capture.sh --platform android

# Subset + short clips
./scripts/native-capture/run-design-capture.sh \
  --platform android \
  --routes Stable,Customise,Replay \
  --clips

# Single still
./scripts/native-capture/android-screencap.sh --route Replay --name replay

# iOS Simulator (macOS)
./scripts/native-capture/run-design-capture.sh --platform ios --routes Ranking
```

Artifacts land in `artifacts/native-captures/` (gitignored) with a
`manifest-*.txt` listing tip SHA and files.

Deep links used by the scripts:

| URL                              | Effect               |
| -------------------------------- | -------------------- |
| `botore://capture/Stable`        | Jump to Stable       |
| `botore://capture/Replay?mute=1` | Jump to Replay muted |

## EAS path (optional cloud binary)

`apps/game/eas.json` defines a `design-review` profile:

- Android **APK** (emulator/device installable)
- iOS **simulator** build
- Bakes `EXPO_PUBLIC_DESIGN_CAPTURE=1`

One-time account link (Carlos / Expo owner):

```bash
cd apps/game
npx eas-cli@latest init   # writes projectId into app config when authorized
npx eas-cli@latest build -p android --profile design-review
# when a Mac/signing path exists:
npx eas-cli@latest build -p ios --profile design-review
```

Install the APK on an emulator, launch the app, then run
`run-design-capture.sh` as above. Local `adb` / Simulator captures remain the
fast path for PR evidence; EAS is optional for a cloud binary.

## GitHub Actions

Workflow: `.github/workflows/native-design-captures.yml`

- Triggers: `pull_request` (path-gated on `apps/game/**`, capture scripts, this
  workflow, docs, `eas.json`) and `workflow_dispatch` (manual; saves macOS
  minutes when iterating docs-only)
- Not part of the required PR quality gate (`lint · typecheck · unit tests`)
- **Android** (`ubuntu-latest`): single-line
  `scripts/native-capture/ci-android-emulator-capture.sh` via
  `reactivecircus/android-emulator-runner` (that action runs each `script:`
  newline in its own shell)
- **iOS** (`macos-15`; `macos-14` retired): `scripts/native-capture/ci-ios-simulator-capture.sh` —
  clean Expo prebuild, **Release** iphonesimulator build (bundle embedded),
  phone-size iPhone Simulator, Stable / Customise / Replay PNGs
- Both jobs build workspace deps first (`pnpm --filter @botore/game^... run build`)
  so Metro can resolve `@botore/*/dist`
- Pins Android Kotlin **1.9.25** via `expo-build-properties` (Compose 1.5.15)
- Hoists `expo-modules-core` / `expo-modules-autolinking` for pnpm so Gradle
  resolves Expo packages; `expo prebuild --clean` keeps `useExpoModules()`
- Manifest tags: `commit`, `platform`, `device` (+ tip SHA / welcome note)
- Uploads separate artifacts
  `native-design-captures-android-<sha>` and
  `native-design-captures-ios-<sha>` with `if-no-files-found: error`
- Optional welcome coverage on iOS: Petrol + axe (Stable) / dagger (Customise)
  via `botore://capture/…?paint=&weapon=` deep links (`CAPTURE_WELCOME=1`)

## Honesty rules

| Acceptable                             | Not acceptable                                |
| -------------------------------------- | --------------------------------------------- |
| Android emulator / device PNG or MP4   | Expo web / Chromium “phone frame”             |
| iOS Simulator PNG or MP4               | Pixel-diff CI gates                           |
| DEV fixture / muted labels             | Claiming live fight when using golden fixture |
| Tip SHA + route in filenames or README | Unlabeled web stills as native                |

## Related

- Phone perf numbers (separate from design stills):
  `docs/architecture/android-release-perf.md`
- First-run routes: `apps/game/src/first-run/routes.ts`
- Capture helpers: `apps/game/src/design-capture/`
