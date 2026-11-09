# launch-v001 — app icon, native splash, wordmark, in-app title

Brand FINAL for C6 ([ClickUp](https://app.clickup.com/t/1amjtrey13r)): wordmark,
icon (iOS + Android adaptive/monochrome), native splash, and in-app silhouette
title. Oxide paint token remains kit-v002 `#E8771C`.

## Provenance / licence

- **Source kit:** Botore-launch-v001 (Project store `media/launch-v001/`), built
  against Art Direction v0.3 and selected REF-01 logo/splash direction.
- **Author:** Botore brand/UI production for this project (hand-constructed SVG
  path geometry → raster PNG). Not third-party stock.
- **Fonts:** none. The wordmark is original path geometry (mechanical second O);
  **no third-party font files or font licences** are bundled or required to
  reproduce these PNGs.
- **Licence:** project-owned brand assets for Botore app/store use. Do not treat
  as freely redistributable clip-art.

## Shipped paths (runtime)

| Path | Use |
| --- | --- |
| `icon/icon-ios-1024.png` | Expo `icon` / iOS icon |
| `icon/adaptive-foreground-1024.png` | Android adaptive foreground |
| `icon/adaptive-background-1024.png` | Android adaptive background (mustard `#F4B820`) |
| `icon/adaptive-monochrome-1024.png` | Android 13+ monochrome |
| `splash/splash-logo-1284.png` | iOS native splash (`expo-splash-screen`) |
| `splash/splash-icon-android-1024.png` | Android 12+ splash image |
| `wordmark/wordmark-*-2400w.png` | In-app `BrandWordmark` (via `garage-tag/assets.ts`) |
| `title/title-composite-silhouette-1290x2796.png` | In-app title splash |

Native config lives in `apps/game/app.json` (`expo-splash-screen` plugin). The
legacy top-level Expo `"splash"` key is intentionally absent. JS brand imports
are centralized in `apps/game/src/garage-tag/assets.ts` so a brand swap is a
one-file change there (plus `app.json` for native).

ui-kit-v0.1 wordmark / app-icon / launch-static are **retired**. Panels, buttons,
tabs, glyphs, and robot-head ranking marks remain under `assets/ui-kit-v0.1`.

## Verification

Native splash must be checked on a **release** Android/iOS binary (Expo Go and
web do not show the real splash). CI Android captures build `assembleRelease`.
