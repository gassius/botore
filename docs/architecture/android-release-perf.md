# Android release-build performance (F12 → R1)

Engineering measurement contract for phone acceptance.
Product authority:
[Overall Product Vision](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1852)
(product acceptance) and
[Technical Architecture §6](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892)
(costs / runtime validation remain open until evidenced).

Tickets:

- [F12 · Android release-build performance + cost validation](https://app.clickup.com/t/1amjtrexzu8)
  (sampler + written proposal — Released)
- [R1 · Native release-build acceptance measure](https://app.clickup.com/t/1amjtrey7v4)
  (this residual — physical release measure)

**Status (R1 scaffolding tip):** proposed thresholds remain the written proposal
for product-owner agreement. Harness + EAS `release-perf` profile landed.
**No physical Android/iOS device or `adb` in the R1 cloud-agent VM** — device
ids, BotorePerf JSON, and pass/fail vs thresholds are **not measured** here.
Do **not** treat Expo web / Chromium captures as native numbers. Skia
comparison is only in scope if a measured release build fails these limits
**after** they are agreed.

## Proposed phone thresholds (agree before measuring)

Assumptions: physical Android phone, **release** APK/AAB (not debug Metro),
representative Play→END replay — prefer **live sealed fight** envelope after
C8 (`416e209`+), with sound on and muted as separate passes, plus reduced
motion. Frame budget is reported against a **16.67 ms** 60 Hz reference even
if the panel is 90/120 Hz (also record the device refresh rate).

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

## Measurement protocol (Carlos / CI runner)

1. Agree (or amend) the table above on the R1 ClickUp task (product owner).
2. Identify the phone: manufacturer, model, SoC/GPU if known, Android API
   level, refresh rate, build id / tip SHA. Record iOS similarly if reachable
   (optional; not a substitute for Android).
3. Produce a **release** Android binary from tip under test with EAS profile
   **`release-perf`** (`apps/game/eas.json`):
   - Sets `EXPO_PUBLIC_PERF_SAMPLE=1`
   - Does **not** set `EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD` (C8 fail-closed)
   - Bake `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` via EAS
     secrets / `--env` for the preferred **live sealed** envelope
   - Leave `EXPO_PUBLIC_PERF_LOAD_KIND` unset; declare warm/cold on the harness
   - Local alternative: `npx expo run:android --variant release` with the same
     public env. Debug Metro and Expo web are preparation only.
4. Install the APK. Sign in, run a live fight → Replay. Enable the opt-in
   sampler (already baked by the profile). Capture `adb logcat` lines tagged
   `BotorePerf` (includes `envelope`, `muted`, `reducedMotion`).
5. Required passes (same tip SHA, same sealed fight when possible):
   - sound on × warm load
   - sound on × cold load (clear app storage / pack cache first)
   - muted × warm (and cold if practical)
   - reduced motion × sound on + muted (OS Reduce motion or in-app override)
6. Prefer `envelope: live_sealed`. If only a DEV golden fixture is available,
   label `dev_fixture` honestly — never as live.
7. Record loading, p95/p99, hard spikes, dropped-frame %, tip SHA, device id.
   Attach logcat + BotorePerf JSON + device id on the R1 ClickUp comment.
8. Written verdict vs the table (this doc + filled
   `scripts/release-perf/results-template.json`). If agreed thresholds fail →
   open Skia comparison as a **follow-on** engineering task; do not silently
   swap renderers in this ticket.

### Harness commands

```bash
node scripts/release-perf/check-env.mjs --platform android --tools-only
node scripts/release-perf/check-env.mjs --platform android

./scripts/release-perf/run-android-measure.sh \
  --pass-id sound-on-warm \
  --load-kind warm \
  --require-envelope live_sealed
```

See `scripts/release-perf/README.md`.

### Opt-in sampler

- Module: `apps/game/src/perf/`
- Constants mirror this document: `PHONE_PERF_THRESHOLDS`
- `FrameTimeSampler` records rAF deltas; `pauseSampling()` drops the frame
  baseline across pause/resume; `markPlaybackStart` clears deltas on Replay
- Play-ready waits for a real stage `onLayout` (no placeholder box) and
  re-arms per replay checksum
- `summarizeFrameSample` computes percentiles, spikes, drops, and pass/fail;
  load is scored only when `EXPO_PUBLIC_PERF_LOAD_KIND` is `warm` or `cold`
  **or** when the harness passes `--load-kind`
- Wired into `CanonicalReplayPlayer` only when `EXPO_PUBLIC_PERF_SAMPLE=1`
- Handle exposes `getPerfSummary()` for native inspection; also logs JSON on
  Play→END with honest `envelope` / `muted` / `reducedMotion` fields

## R1 agent-run provenance (this tip)

| Field                          | Value                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Tip base                       | `main` @ C8 `416e209` + later merges (see PR head SHA)                       |
| EAS profile                    | `release-perf` (APK, internal, `EXPO_PUBLIC_PERF_SAMPLE=1`, no DEV scaffold) |
| Preferred envelope             | **live sealed fight** (C8 fail-closed path)                                  |
| Device(s) in this agent VM     | **none** — no `adb`, no USB bus, no physical phone / emulator                |
| Release binary produced here   | **no** — EAS minutes **unknown** (not run)                                   |
| BotorePerf / logcat attached   | scaffolding only; no device capture                                          |
| iOS                            | not reachable from this Linux VM; runner docs cover optional record          |
| Verdict vs proposed thresholds | **not_measured** — thresholds not yet PO-agreed; no device numbers           |
| Skia follow-on                 | **not opened** (no failing agreed measure)                                   |

## Parked integration checks (preserve; do not reopen cleared F9/F10 visuals)

Tracked under F12 / R1 / product acceptance — not new product scope:

| Check                                            | Status                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Live F9 sealed fight → replay/loadout continuity | Preferred path after C8; still needs a measured release-perf APK with baked Supabase public env |
| END / Winner text vs server-confirmed result     | OPEN                                                                                            |
| Native (non-web) acceptance                      | OPEN — blocked on physical Android release build + Carlos threshold agreement                   |
| Final likeness / art acceptance                  | OPEN (UI/Carlos)                                                                                |
| Android release-build perf (this doc)            | SCAFFOLDED — harness + profile landed; device measure pending Carlos / CI runner                |

## Cost ledger (unknown ≠ zero)

| Cost class                                           | Value                | Notes                                                                       |
| ---------------------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| Supabase Edge Function CPU / invocations (combat-v1) | **unknown**          | No live sealed-fight measure run in this agent VM                           |
| Supabase Storage / CDN egress (atlas packs)          | **unknown**          | Trial packs currently Metro-bundled stubs; CDN cold path not exercised here |
| Paid media generation (ElevenLabs etc.)              | **none this ticket** | No paid gen; Carlos go still required before any                            |
| EAS / CI build minutes for release APK               | **unknown**          | No release binary produced in this agent VM                                 |
| Physical device time                                 | **unknown**          | No device attached (`adb` unavailable)                                      |
| Supervision / evaluation time                        | **unknown**          |                                                                             |

## Non-goals

- Fabricating native frame numbers from Expo web / Playwright
- Ranking restack, Carlos merge, or paid generation
- Declaring PNG customisation proven
- Treating CI green as phone acceptance
- Catalogue expansion
