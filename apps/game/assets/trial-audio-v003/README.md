# trial-audio-v003

`trial-audio-v002` (all 8 trial clips + atlas-v1 part/arena sounds, **byte-identical**) plus 4 new one-shots for the new screens
(Result overlay and Customise). AI-generated with ElevenLabs (Creator plan, commercial use) on 2026-11-17 under Carlos's go.

## New in v003

| File | Trigger | Duration (s) | Loudness (LUFS) | True peak (dBTP) |
|---|---|---|---|---|
| `clips/new-record.m4a` | `result_new_record` | 1.76 | -18.2 | -2.6 |
| `clips/xp-tick.m4a` | `xp_bar_step` | 0.12 | -24.9 | -5.6 |
| `clips/equip.m4a` | `loadout_equipped` | 0.487 | -18.3 | -1.8 |
| `clips/select.m4a` | `part_card_selected` | 0.18 | -22.3 | -9.4 |

All AAC-LC `.m4a`, 44.1 kHz, mono, 96 kbps; true peak ≤ −1 dBTP.
`new-record` and `equip` target −18 LUFS. `select` (−22.3) sits just under `ui-tap` (−21.8) and is lower and rounder in tone, so the two read
as siblings, not duplicates. `xp-tick` (−24.9) is the quietest clip in the pack, built to repeat rapidly while the XP bar fills.

Unchanged from v002: `clips/{swing,hit,dodge,defeat,hush,ui-tap,win,music-loop}.m4a` and everything under `atlas-v1/` (see v002 tables in PROVENANCE.md).

Contents: `clips/`, `atlas-v1/`, `manifest.json`, `PROVENANCE.md`, `INTEGRATION.md`, `SHA256SUMS`, `code-change.patch`, `repo-drop/`.

Status: final candidates, pending Carlos's ear approval on phone.
