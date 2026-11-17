# trial-audio-v003 — integration

**Prerequisite:** trial-audio-v002 applied (its `repo-drop/` copied and its `code-change.patch` applied). This patch is relative to that state.
If v002 never landed, apply v002 first, then this.

## Steps (repo root)

1. Copy `repo-drop/` into the repo root. It adds `apps/game/assets/trial-audio-v003/**` (v002 stays untouched and immutable) and re-includes the
   v002 base/seed audio at the same paths, byte-identical, so the drop is self-contained.
2. `git apply code-change.patch`. It changes:
   - `src/audio/trialAudioPin.ts`: pin → `trial-audio-v003`; `TrialAudioClipId` gains `newRecord`, `xpTick`, `equip`, `select`;
     new `TrialAudioUiCueId` type and `TRIAL_AUDIO_UI_CUE_IDS`.
   - `src/audio/trialAudioManifest.ts`: imports the v003 manifest; sealed hashes for all 12 clips + manifest.
   - `src/audio/trialAudioMetroAssets.ts`: `require()` paths → v003, plus the 4 new clips.
   - `src/audio/TrialAudioSession.ts`: new `playCue(id: TrialAudioUiCueId)`, fire-and-forget like `playUiTap`, honours master mute and
     the Effects toggle.
   - `src/audio/index.ts`: exports the new type and ids.
   - `test/f11-trial-audio.test.ts`: v003 pin, 12 clips, source maps with the new ids, cumulative credit cost 1,216, plus a test that
     `playCue` plays each UI cue and stays silent when muted.
3. Wire the triggers in the screens (not in this patch, the screens are being rebuilt in D2/D3):

| Clip | Manifest trigger | Where |
|---|---|---|
| `newRecord` | `result_new_record` | Result overlay, when the NEW RECORD stamp lands (after the `win` stinger, not on top of it) |
| `xpTick` | `xp_bar_step` | Result overlay, each XP bar step; throttle to one tick per ~60 ms, with ±1 semitone / ±2 dB variation |
| `equip` | `loadout_equipped` | Customise, only after EQUIP **succeeds** (server confirmed), not on press |
| `select` | `part_card_selected` | Customise, tapping a weapon/part card in the strip |

Rules unchanged: fire-and-forget, never block the UI or fight clock, master mute + Effects toggle, iOS silent switch / Android sound mode.

## Verified

On a scratch export of `origin/main` @ `ec0f0df` (not the repo): v002 drop + patch, then v003 drop + patch →
`apps/game` vitest 36 files / 276 tests passed, `tsc --noEmit` clean, Prettier clean, `scripts/pack-workshop-frame-atlas.test.mjs` passes, and ESLint on `src/audio` + the test is clean.
