# Android release-build performance (F12)

Engineering measurement contract for phone acceptance.
Product authority:
[Overall Product Vision](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1852)
(product acceptance) and
[Technical Architecture §6](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892)
(costs / runtime validation remain open until evidenced).

Ticket: [F12 · Android release-build performance + cost validation](https://app.clickup.com/t/1amjtrexzu8).

**Status:** thresholds below are the written proposal for product-owner
agreement. Do **not** treat Expo web / Chromium captures as native numbers.
Skia comparison is only in scope if a measured release build fails these
limits after they are agreed.

## Proposed phone thresholds (agree before measuring)

Assumptions: physical Android phone, **release** APK/AAB (not debug Metro),
representative Play→END replay on the F10/F11 tip with sound on and muted as
separate passes. Frame budget is reported against a **16.67 ms** 60 Hz
reference even if the panel is 90/120 Hz (also record the device refresh rate).

| Metric                     | Proposed limit                    | How measured                                                                                                                                                                                |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warm load → Play-ready     | ≤ **1000 ms**                     | Packs already on device; clock from replay route mount to first interactive Play-ready frame (`assetsAvailable` + stage laid out)                                                           |
| Cold load → Play-ready     | ≤ **3000 ms**                     | Process cold start into the same replay route with packs not yet cached (CDN/Storage miss path). If packs are only Metro-bundled stubs, record that fact and mark cold CDN path **unknown** |
| Frame-time p95 (Play→END)  | ≤ **20 ms**                       | `requestAnimationFrame` deltas while playback is playing                                                                                                                                    |
| Frame-time p99 (Play→END)  | ≤ **33 ms**                       | Same sample                                                                                                                                                                                 |
| Hard spikes (`dt > 33 ms`) | ≤ **5** per representative replay | Count, not averaged away                                                                                                                                                                    |
| Dropped frames             | ≤ **2%** of sampled frames        | A drop is `dt > 25 ms` (≈1.5× 60 Hz vsync). Report count and %                                                                                                                              |
| Average FPS / browser FPS  | **Out of scope**                  | Never used for acceptance                                                                                                                                                                   |

Renderer policy (Vision): start with RN `Animated`; compare Skia **only** if
the agreed thresholds fail on the measured release build. An audio fault alone
does not justify a renderer rewrite.

## Measurement protocol

1. Agree the table above on the F12 ClickUp task (product owner).
2. Identify the phone: manufacturer, model, SoC/GPU if known, Android API
   level, refresh rate, build id / tip SHA.
3. Produce a **release** Android binary from tip under test
   (`npx eas-cli@latest build -p android` once `eas.json` exists, or
   `npx expo run:android --variant release` after CNG prebuild). Debug Metro
   and Expo web are preparation only.
4. Enable the opt-in sampler with `EXPO_PUBLIC_PERF_SAMPLE=1` on that release
   binary (rebuild required). Capture `adb logcat` lines tagged
   `BotorePerf`.
5. Run the representative replay once with sound on, once muted. Prefer the
   same sealed fight used for visual/audio acceptance when a live F9 envelope
   is available; until then, label DEV golden fixture runs honestly.
6. Record loading, p95/p99, hard spikes, dropped-frame %, tip SHA, device id.
7. If thresholds fail → open Skia comparison as a **follow-on** engineering
   task; do not silently swap renderers in this ticket.

### Opt-in sampler

- Module: `apps/game/src/perf/`
- Constants mirror this document: `PHONE_PERF_THRESHOLDS`
- `FrameTimeSampler` records rAF deltas; `summarizeFrameSample` computes
  percentiles, spikes, drops, and pass/fail against the proposed limits
- Wired into `CanonicalReplayPlayer` only when `EXPO_PUBLIC_PERF_SAMPLE=1`
- Handle exposes `getPerfSummary()` for native inspection; also logs JSON on
  Play→END

## Parked integration checks (preserve; do not reopen cleared F9/F10 visuals)

Tracked under F12 / product acceptance — not new product scope:

| Check                                                                                   | Status                                                                                                    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Live F9 sealed fight → replay/loadout continuity (current motion is DEV golden fixture) | OPEN                                                                                                      |
| END / Winner text vs server-confirmed result                                            | OPEN                                                                                                      |
| Native (non-web) acceptance                                                             | OPEN — blocked on physical Android release build                                                          |
| Final likeness / art acceptance                                                         | OPEN (UI/Carlos)                                                                                          |
| Android release-build perf (this doc)                                                   | BLOCKED — no identified physical device in this agent environment; thresholds proposed, not yet PO-agreed |

## Cost ledger (unknown ≠ zero)

| Cost class                                           | Value                | Notes                                                                  |
| ---------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| Supabase Edge Function CPU / invocations (combat-v1) | **unknown**          | Hosted project may be paused; no F12 measurement run                   |
| Supabase Storage / CDN egress (atlas packs)          | **unknown**          | Trial packs currently Metro-bundled stubs; CDN cold path not exercised |
| Paid media generation (ElevenLabs etc.)              | **none this ticket** | No paid gen; Carlos go still required before any                       |
| EAS / CI build minutes for release APK               | **unknown**          | No release binary produced here                                        |
| Physical device time                                 | **unknown**          | No device attached (`adb` unavailable)                                 |
| Supervision / evaluation time                        | **unknown**          |                                                                        |

## Non-goals

- Fabricating native frame numbers from Expo web / Playwright
- Ranking restack, Carlos merge, or paid generation
- Declaring PNG customisation proven
- Treating CI green as phone acceptance
