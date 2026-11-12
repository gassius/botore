# Store listing copy + screenshots (R4)

Draft App Store Connect / Google Play listing text and how to produce
**native** screenshots. Do not invent product promises beyond Art Direction
(phone-first robot auto-battler; server-computed fights; client playback).

Ticket: [R4](https://app.clickup.com/t/1amjtrey7vd). Identity:
`com.botore.game` / display name **Botore** (`apps/game/app.json`).

## Listing copy (draft)

Carlos may edit voice before console paste. Keep claims aligned with shipped
first-run: Stable → Customise → fight → Replay → Ranking; Game Center /
Play Games (or device-fallback) sign-in; no IAP / ads in this build.

### Shared subtitle / short description

**Botore — robot auto-battler.** Equip a bot, pick a fight, watch the replay.

### App Store — promotional text (optional, ≤170)

Build your bot in the garage, challenge a rival, and play back a
server-resolved fight on your phone.

### App Store — description

Botore is a phone-first robot auto-battler. Assemble a loadout in the Stable
and Customise screens, confirm a fight, then watch a deterministic replay of
the server-computed bout. Climb the Ranking board between fights.

Sign-in uses Game Center on iOS and Play Games on Android when available, with
a secure on-device fallback if a platform proof is missing. Progress lives on
your Botore account in the cloud.

Privacy policy: `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/privacy`  
Account deletion: `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/account/delete`

### Play — short description (≤80)

Robot auto-battler: equip, fight, watch the replay.

### Play — full description

Same body as the App Store description above. Keep the privacy and deletion
URLs absolute once Carlos sets `EXPO_PUBLIC_PUBLIC_WEB_ORIGIN` (SSO-free
custom domain on the `botore-game` Vercel host — see
[`docs/legal/privacy-policy.md`](../legal/privacy-policy.md)).

### Keywords (App Store draft)

robot, battler, auto-battler, garage, replay, arena, customise, ranking

Avoid trademarked competitor names. Refine after keyword research if needed.

### What’s New (0.1.0 / first TestFlight)

First internal build: garage, customise, live fight when configured, replay,
ranking, Settings (mute / music / SFX / reduced motion), privacy policy and
account deletion.

### Category

Primary: Games → Strategy (or Action if Carlos prefers). Secondary: optional.

### Copyright / seller

Carlos / Botore legal entity as registered in ASC / Play Console (R2).

## Icons & brand assets

Use committed launch assets (C6) — do not invent new marketing art here:

| Asset            | Path                                                  |
| ---------------- | ----------------------------------------------------- |
| iOS icon 1024    | `apps/game/assets/launch-v001/icon/icon-ios-1024.png` |
| Android adaptive | `apps/game/assets/launch-v001/icon/adaptive-*.png`    |
| Splash           | `apps/game/assets/launch-v001/splash/`                |

## Screenshots pipeline (native only)

**Web / Expo web preview is not valid store evidence.** Reuse the C7 native
design-capture path documented in
[`docs/architecture/native-design-captures.md`](../architecture/native-design-captures.md).

### Target frames (store)

Capture phone-size stills (portrait) of the first-run loop:

1. Stable (equipped bot)
2. Customise (paint / weapon)
3. Confirm fight
4. Replay (impact / arena)
5. Ranking
6. Optional: Settings; public `/privacy` is web — do not use as a phone still

Prefer a **physical device or phone emulator/simulator** Release / preview
binary **without** design-capture DEV chrome when submitting to stores. For
pipeline practice, design-capture mode is fine — label files `DEV-capture` and
do not paste those into the live listing without a clean retake.

### Commands

```bash
# Tooling check
node scripts/native-capture/check-capture-env.mjs --platform android

# Walk first-run routes on a live Android emulator/device
./scripts/native-capture/run-design-capture.sh \
  --platform android \
  --routes Stable,Customise,ConfirmFight,Replay,Ranking

# iOS Simulator (macOS)
./scripts/native-capture/run-design-capture.sh \
  --platform ios \
  --routes Stable,Customise,ConfirmFight,Replay,Ranking
```

Artifacts: `artifacts/native-captures/` (gitignored) + `manifest-*.txt`.

CI optional: `.github/workflows/native-design-captures.yml` uploads
`native-design-captures-{android,ios}-<sha>`.

### Store console sizes (Carlos fills exact slots)

| Store     | Typical phone slots                                                                   |
| --------- | ------------------------------------------------------------------------------------- |
| App Store | 6.7" and 6.5" (or current ASC required sizes) — export from iPhone Simulator / device |
| Play      | Phone screenshots 16:9 or 9:16 per Play Console guidance                              |

Do **not** upscale web captures into these slots. Tablet screenshots optional
(`supportsTablet: true` today) — skip until Carlos asks.

### Honesty rules (same as C7)

| Acceptable                    | Not acceptable                                |
| ----------------------------- | --------------------------------------------- |
| Android emulator / device PNG | Expo web / Chromium phone frame               |
| iOS Simulator / device PNG    | Unlabeled DEV-fixture stills as production    |
| Tip SHA + route in filenames  | Claiming live fight when using golden fixture |

## Related

- Release checklist: [`checklist.md`](./checklist.md)
- Questionnaires: [`store-questionnaires.md`](./store-questionnaires.md)
- R2 credentials: [`docs/architecture/eas-production-credentials.md`](../architecture/eas-production-credentials.md)
