# trial-audio-v002 — integration

## What changes

Same clip ids, same file names, same formats as v001. Playback goes through the existing backend in
`apps/game/src/audio/` (`TrialAudioSession` → `expoAvBackend`); no new playback code is needed. The existing
rules still apply: fire-and-forget, never await audio in the fight clock, honour master mute and the Music / Effects
toggles (`botore-player-settings.json`), honour the iOS silent switch / Android sound mode, pause on interruption, and
web preview only starts audio after the first tap.

## Steps (from the repo root)

1. Copy everything under `repo-drop/` into the repo root (paths are already repo paths):
   - `apps/game/assets/trial-audio-v002/**` — new immutable trial pack (v001 stays untouched, as its PROVENANCE requires).
   - `apps/game/assets/atlas/base/audio/*.m4a` — bundled base pack (`expo-bundled-base-pack.ts`), overwritten in place, same names.
   - `supabase/seed/atlas/v1/base/audio/*.m4a`, `supabase/seed/atlas/v1/parts/*/…m4a`, `supabase/seed/atlas/v1/arenas/quiet/ambient.m4a` — seed atlas, overwritten in place, same names (v1 seed is still `status: draft`).
2. Apply `code-change.patch` (`git apply code-change.patch`). **A small code change is required** — the trial pack is pinned and hash-sealed:
   - `src/audio/trialAudioPin.ts`: `ACTIVE_TRIAL_AUDIO_ASSET_VERSION` → `'trial-audio-v002'`.
   - `src/audio/trialAudioManifest.ts`: import `assets/trial-audio-v002/manifest.json` and replace `TRIAL_AUDIO_SEALED_SHA256` with the v002 hashes.
   - `src/audio/trialAudioMetroAssets.ts`: `require()` paths → `trial-audio-v002/clips/*`.
   - `test/f11-trial-audio.test.ts`: pack root/version → v002, `placeholder` → false, `paid_generation` → used / go given / credit cost recorded.
   Without step 2 the fight view keeps playing the silent v001 clips, because `TRIAL_AUDIO_METRO_SOURCES` points at v001.
3. Regenerate the Development atlas seed if needed: `scripts/pack-workshop-frame-atlas.mjs` overlays kit-v003 onto `supabase/seed/atlas/v1` (carries proof audio forward). Former v2/v3 pack dirs are retired.
4. Upload the updated seed audio to Supabase Storage the same way the v1 proof pack was published.
5. Run `apps/game` tests and build the APK.

Verified on a scratch export of `origin/main` @ `ec0f0df` (not the repo itself): after copying `repo-drop/` and applying
`code-change.patch`, `apps/game` vitest passes 36 files / 275 tests (incl. `f11-trial-audio.test.ts`, 14/14), `tsc --noEmit` is clean,
`scripts/pack-workshop-frame-atlas.test.mjs` passes, and Prettier reports no formatting issues.

## Notes for engineers

- `music-loop.m4a` should be played with `isLooping: true` and volume 0.55 (manifest). The loop is sample-accurate in the PCM;
  AAC has encoder priming, carried in the MP4 edit list. If a player ignores the edit list you may hear a tiny gap at the loop point;
  if that happens on Android, report it and I'll deliver a WAV/OGG loop variant.
- The arena ambient (`arenas/quiet/ambient`) is not wired in the trial path yet (no trigger in `cueFromCommand.ts`); it's
  delivered for the atlas seed. Suggested use: loop under the fight at about 0.3 volume on the Music channel.
- Part sounds (`weapon.sword|axe|dagger`, `chassis.light`) are resolved via `resolve-audio.ts` (part clip first, base fallback).
  The trial replay path currently always plays the generic `swing` / `hit`; per-weapon swings need a lookup from the equipped
  weapon's sound tag to its part clip.
- Keep the ±1 semitone / ±2 dB per-trigger variation in code, not as extra files.
