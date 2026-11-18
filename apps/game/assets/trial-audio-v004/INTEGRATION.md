# trial-audio-v004 — integration

**Prerequisite:** trial-audio-v003 applied (its `repo-drop/` copied and its `code-change.patch` applied). This patch is relative to that state.
If earlier packs never landed, apply v002, then v003, then this.

Screen names follow the UI/UX D tickets for APK review 2 (D5–D10). The home is the **Ludus** (Roman gladiator school; Botore = bot + doctore).

## Steps (repo root)

1. Copy `repo-drop/` into the repo root. It adds `apps/game/assets/trial-audio-v004/**` (v003 stays untouched and immutable) and re-includes the
   previous base/seed audio at the same paths, byte-identical, so the drop is self-contained.
2. `git apply code-change.patch`. It changes:
   - `src/audio/trialAudioPin.ts`: pin → `trial-audio-v004`; `TrialAudioClipId` gains `menuLoop`, `splashSting`, `faceOffSting`, `uiConfirm`, `uiBack`, `uiTab`, `uiSnap`, `uiCreate`, `uiError`, `uiToggle`; `TrialAudioUiCueId` / `TRIAL_AUDIO_UI_CUE_IDS` include the new effects cues.
   - `src/audio/trialAudioManifest.ts`: imports the v004 manifest; sealed hashes for all 22 clips + manifest.
   - `src/audio/trialAudioMetroAssets.ts`: `require()` paths → v004, plus the 10 new clips.
   - `src/audio/audioBackend.ts` + `src/audio/expoAvBackend.ts`: optional `LoopHandle.setVolume` so a 600 ms crossfade can ramp.
   - `src/audio/TrialAudioSession.ts`: `playCue` covers the new UI ids (effects channel). New `playSplashSting()`, `playFaceOffSting()`, `startMenuLoop()`, `crossfadeToFight({ durationMs: 600 })`, `crossfadeToMenu({ durationMs: 600 })`. Honour master mute, the Music / Effects toggles, and do not block the UI or fight clock. Existing fight `notifyCommand` behaviour is unchanged — screens must call the new menu/crossfade methods.
   - `test/f11-trial-audio.test.ts`: v004 pin, 22 clips, cumulative credit cost 2,916, `playCue` covers the extended UI list, plus a menu-loop / mute test.
3. Wire the triggers in the screens (this is the work that makes tonight's APK audible outside the fight). Engineering plumbing is E8: https://app.clickup.com/t/1amjtrezebh

## Music rules

| When | Cue / method |
|---|---|
| In-app splash / launch title appears | `playSplashSting()`, then `startMenuLoop()` (the sting may overlap the first beat of the loop) |
| Every non-fight screen: Auth, **Ludus** (D5), **Create Bot** (D6), **Customise** (D7), **Opponents** (D8), **Tale of the Tape** (D9), Result, Ranking, Settings, More | keep `menuLoop` running (`startMenuLoop()` if it is not already) |
| **Tale of the Tape** (D9) appears | `playFaceOffSting()` over the still-running `menuLoop` |
| Entering the **Fight View** (D10) / `show_battle` | `crossfadeToFight({ durationMs: 600 })` — 600 ms into the existing fight `musicLoop` |
| **Result overlay** (D10, after the knockout) | `crossfadeToMenu({ durationMs: 600 })` — 600 ms back to `menuLoop` |
| Master mute on, Music toggle off, or silent mode | both loops and both stings stay silent (handles may be created so unmute can resume). Preload both loops at session start. |

`menu-loop` is a calm-but-confident Ludus / hangar loop (96 BPM, 20 bars, 49.994 s), same metallic scrap-metal family as the fight loop but quieter and more spacious.

## Trigger map (D5–D10 screen / control → cue)

All of these honour master mute and the iOS silent switch / Android sound mode. Visual state stays authoritative — never sound-only feedback. Fire-and-forget; never `await` on the UI thread or the fight clock. If a control is disabled or a quota blocks the action, play `uiError` **and** keep the existing disabled visual.

### D5 — Ludus (home) — https://app.clickup.com/t/1amjtrezebp

The home is the Ludus. Up to 3 bots in a snapping carousel, a Create Bot slot, Settings above More, Sign out moved into More.

| Control | Cue |
|---|---|
| Bot carousel snap | `uiSnap` |
| Tap an existing bot to make it active | `uiTap` (existing) |
| **Create Bot** slot / button | `uiCreate` |
| **Find opponent** (primary) | `uiConfirm` |
| Customise, Settings, and other secondary buttons | `uiTap` (existing) |
| Bottom / category tabs (Ludus, Ranking **Bots / Botores**, Settings, **More** last) | `uiTab` |
| Sign out (inside More, not on the Ludus itself) | `uiTap` (existing) |
| Blocked Create Bot (already 3 bots) | `uiError` |

### D6 — Create Bot — https://app.clickup.com/t/1amjtrezebq

Random editable name, a starting paint and weapon, a Create button.

| Control | Cue |
|---|---|
| Opening the view (the Create Bot control on the Ludus already played `uiCreate`) | no extra sting |
| Starting paint / weapon carousel snap | `uiSnap` |
| Tapping a paint or weapon card | `select` (existing) |
| Name field confirm / done | `uiConfirm` |
| **Create** (primary) | `uiConfirm` |
| Back / discard | `uiBack` |
| Blocked create | `uiError` |

### D7 — Customise — https://app.clickup.com/t/1amjtrezebt

Eight approved paints plus two stripe patterns in a snapping carousel, approved weapons, editable name.

| Control | Cue |
|---|---|
| Paint / pattern or weapon carousel snap | `uiSnap` |
| Tapping a paint, pattern, or weapon / part card | `select` (existing) |
| Name field confirm / done | `uiConfirm` |
| EQUIP — only after the save **succeeds** (server confirmed) | `equip` (existing). Do not also fire `uiConfirm` on that success. |
| Back / discard unsaved | `uiBack` |

### D8 — Opponents — https://app.clickup.com/t/1amjtrezebu

Snapping list, bigger robots, Botore name and record, a big Fights remaining count with a refill countdown.

| Control | Cue |
|---|---|
| Vertical list snap | `uiSnap` |
| Choose opponent / continue | `uiConfirm` |
| Back | `uiBack` |
| Start / continue blocked (no fights remaining) | `uiError` plus the existing disabled visual. The countdown itself is silent. |

### D9 — Tale of the Tape (face-off) — https://app.clickup.com/t/1amjtrezebv

Face-off of the two robots with stats below. `menuLoop` keeps running.

| Control | Cue |
|---|---|
| Screen appears | `playFaceOffSting()` (over `menuLoop`) |
| **Start fight** | `uiConfirm` |
| Back | `uiBack` |

### D10 — Fight View + Result overlay — https://app.clickup.com/t/1amjtrezebw

Fixed call-out slot; Repair Yard as an arena tag; Result overlay after the knockout with Back to Ludus, Watch again and Ranking.

| Control | Cue |
|---|---|
| Entering the fight / `show_battle` | `crossfadeToFight({ durationMs: 600 })`; fight swing / hit / dodge / defeat / hush / win / fight `musicLoop` / arena ambient unchanged from v003 |
| Result overlay appears (after knockout) | `crossfadeToMenu({ durationMs: 600 })` |
| NEW RECORD stamp | `newRecord` (existing; after `win`, not on top of it) |
| XP bar step | `xpTick` (existing; throttle ~60 ms, ±1 st / ±2 dB) |
| **Back to Ludus** (primary) | `uiConfirm` |
| **Watch again**, **Ranking** (secondary) | `uiTap` (existing) |

### Other screens

| Screen | Control | Cue |
|---|---|---|
| Auth entry | primary (sign in / continue) | `uiConfirm` |
| Auth entry | secondary links | `uiTap` (existing) |
| Auth entry | back | `uiBack` |
| Ranking | **Bots / Botores** tabs | `uiTab` |
| Ranking | row tap / pull-to-refresh | `uiTap` (existing) |
| Ranking | back | `uiBack` |
| Settings | Master mute, Music, Effects, Reduced motion switches | `uiToggle` |
| Settings | back | `uiBack` |

## Notes

- `menu-loop.m4a` should be played with `isLooping: true` and volume 0.55 (manifest), same as the fight loop. The loop is sample-accurate in the PCM; AAC has encoder priming, carried in the MP4 edit list. If a player ignores the edit list you may hear a tiny gap at the loop point; if that happens on Android, report it and I will deliver a WAV/OGG loop variant.
- Crossfade: if `LoopHandle.setVolume` is present (expo-av backend in this patch), ramp 600 ms. If a test backend omits it, the session hard-switches so tests and older backends stay silent-safe.
- ClickUp storage is full — do not attach these files to the ticket. The pack lives at `/workspace/botore/audio/botore-trial-audio-v004.zip`.

## Related tickets

- C18 (this pack): https://app.clickup.com/t/1amjtrezeaw
- E8 (engineering plumbing): https://app.clickup.com/t/1amjtrezebh
- D5 Ludus: https://app.clickup.com/t/1amjtrezebp
- D6 Create Bot: https://app.clickup.com/t/1amjtrezebq
- D7 Customise: https://app.clickup.com/t/1amjtrezebt
- D8 Opponents: https://app.clickup.com/t/1amjtrezebu
- D9 Tale of the Tape: https://app.clickup.com/t/1amjtrezebv
- D10 Fight View + Result: https://app.clickup.com/t/1amjtrezebw

## Verified

On a scratch v003 tree, `code-change.patch` applies cleanly (`patch -p1 --dry-run` exit 0). After building the workspace packages (`@botore/replay`, `@botore/rng`, `@botore/combat-engine`, `@botore/test-fixtures`), `apps/game` `vitest run test/f11-trial-audio.test.ts` passed: 16 tests, 1 file. Engineer Supervisor should still re-run game tests after dropping the pack into the real repo.
