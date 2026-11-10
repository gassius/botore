# Audio implementation index

Creative direction, mood, and generation caps live in ClickUp:
[Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072).
This file is the **in-repo implementation index** for engineering: paths,
formats, loudness targets, trigger tags, and fallbacks. Starting loudness and
sync numbers are confirmed after the first on-phone test; they are not a
substitute for the ClickUp audio doc.

Missing audio must not block a fight.

## Paths

Versioned media lives in Supabase Storage. Sound files are **separate from
images** (not stored inside PNG pixels) and listed in the **same versioned
manifest** as part art.

| Pack       | Path (example)             | Ships in   | Downloaded                  |
| ---------- | -------------------------- | ---------- | --------------------------- |
| Base pack  | `atlas/vN/base/`           | App bundle | Always present              |
| Part packs | `atlas/vN/parts/<partId>/` | Storage    | Stable + current fight only |

### Trial pack pin (F11)

Until atlas base-pack download is wired on the F10 replay path, the client also
ships a **separate versioned trial audio pack** for CanonicalReplayPlayer:

| Pack                        | Path                                 | Pin                                                          |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Trial base (7 SFX + 1 loop) | `apps/game/assets/trial-audio-v001/` | `ACTIVE_TRIAL_AUDIO_ASSET_VERSION` in `apps/game/src/audio/` |

Placeholders are silent AAC stubs with provenance in `PROVENANCE.md`. Mood is
provisional. Missing/failed clips never block or desync playback.

Saved fights reference an **immutable asset version** so replays keep original
sounds. Do not invent a Storage layout beyond this; the first real manifest
pins exact keys.

## Formats

| Kind    | Container  | Sample rate | Channels |
| ------- | ---------- | ----------- | -------- |
| Effects | AAC `.m4a` | 44.1 kHz    | mono     |
| Music   | AAC `.m4a` | 44.1 kHz    | stereo   |

Loops must be seamless at the loop point before delivery.

Starting size budgets (confirm on device): base pack about 1.5 MB; each part
sound pack under 100 KB.

## Loudness (starting values)

Confirm after the first on-phone test:

- Effects: about −18 LUFS short-term
- Music: about −23 LUFS integrated
- True peak: at or below −1 dBTP

Playback variation (not extra files): about ±1 semitone pitch and ±2 dB volume
per trigger.

## Trigger tags

Each catalogue part carries **sound tags**. The client builds a bot's sound
from equipped parts. Decals and paint have no sound.

| Part slot | Sound role              | Tags                                          |
| --------- | ----------------------- | --------------------------------------------- |
| Chassis   | Movement and hit weight | `chassis.light`, `chassis.heavy`              |
| Weapon    | Swing and impact        | `weapon.sword`, `weapon.axe`, `weapon.dagger` |
| Shield    | Block and impact        | `shield.metal` (later)                        |
| Drone     | Idle hum and action     | `drone.basic` (later)                         |

Map one-shots to `combat-v1` semantic events (see
`docs/architecture/combat-v1.md`). A seed-only replay is not enough to
re-trigger audio.

| Trigger / event      | Pack                                   | Notes               |
| -------------------- | -------------------------------------- | ------------------- |
| UI tap               | base                                   | buttons             |
| Fight screen         | base                                   | music loop          |
| hush                 | base                                   | before first attack |
| `attack_selected`    | part weapon tag, else base swing       |                     |
| `damage_applied`     | part chassis/weapon tag, else base hit |                     |
| `dodged`             | base dodge                             |                     |
| `character_defeated` | base defeat                            |                     |
| `battle_ended` (win) | base win stinger                       |                     |

Manifest entries per clip: file, slot or trigger event, volume, loop points,
sound tags.

## Fallbacks

1. Prefer the part-tagged clip from the downloaded pack for this asset version.
2. If missing, not downloaded, or failed to decode: use the **base-pack**
   generic clip for that slot/event.
3. If the base clip is also missing: continue the fight silently for that
   trigger.

A fight never waits on audio download. Player controls (Music / Effects
toggles, iOS silent switch, Android sound mode, pause on interruption) are
runtime requirements; web preview starts audio on the first tap.

### Settings (C9)

The first-run **Settings** screen (Garage Tag entry from Stable) owns:

- **Master mute** — persisted across kill/relaunch (`botore-player-settings.json`)
- **Music** / **Effects** channel toggles — honored by `TrialAudioSession` on replay
- **Reduced-motion override** — OR'd with the OS preference (never clears OS)

Do not invent loudness finals here; Audio Director owns creative levels.
