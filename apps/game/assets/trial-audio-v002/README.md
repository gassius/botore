# trial-audio-v002

Real audio for Botore, replacing the silent 0.05 s placeholders of `trial-audio-v001`.
AI-generated with ElevenLabs (Creator plan, commercial use) on 2026-11-17 under Carlos's explicit go.

Mood: Scrapyard arena / Repair Yard — mechanical, punchy, slightly playful, metallic and servo textures.

## Contents

- `clips/` — the 8 trial clips, **same file names as v001** (`swing`, `hit`, `dodge`, `defeat`, `hush`, `ui-tap`, `win`, `music-loop`).
- `atlas-v1/` — atlas seed audio not covered by the trial pack: part sounds (`parts/weapon-sword|weapon-axe|weapon-dagger/swing.m4a`, `parts/chassis-basic/hit.m4a`) and the arena bed (`arenas/quiet/ambient.m4a`).
- `repo-drop/` — every file laid out at its exact repo path, ready to copy into the repo root.
- `code-change.patch` — the small pin/hash/test update needed to switch the app from v001 to v002 (see INTEGRATION.md).
- `manifest.json`, `PROVENANCE.md`, `INTEGRATION.md`, `SHA256SUMS`.

## Measured output

| File | Duration (s) | Loudness (LUFS) | True peak (dBTP) | Channels |
|---|---|---|---|---|
| `clips/swing.m4a` | 0.5 | -18.3 | -2.2 | mono |
| `clips/hit.m4a` | 0.6 | -19.8 | -1.4 | mono |
| `clips/dodge.m4a` | 0.431 | -18.3 | -4.9 | mono |
| `clips/defeat.m4a` | 2.0 | -18.1 | -1.8 | mono |
| `clips/hush.m4a` | 1.466 | -18.1 | -1.1 | mono |
| `clips/ui-tap.m4a` | 0.12 | -21.8 | -1.0 | mono |
| `clips/win.m4a` | 2.48 | -18.0 | -4.8 | mono |
| `clips/music-loop.m4a` | 29.996 | -23.0 | -9.8 | stereo |
| `atlas-v1/parts/weapon-sword/swing.m4a` | 0.438 | -18.1 | -2.9 | mono |
| `atlas-v1/parts/weapon-axe/swing.m4a` | 0.576 | -18.0 | -4.8 | mono |
| `atlas-v1/parts/weapon-dagger/swing.m4a` | 0.214 | -18.5 | -1.3 | mono |
| `atlas-v1/parts/chassis-basic/hit.m4a` | 0.5 | -18.2 | -2.4 | mono |
| `atlas-v1/arenas/quiet/ambient.m4a` | 23.95 | -23.1 | -7.2 | stereo |

Format: AAC-LC in `.m4a`, 44.1 kHz. Effects mono 96 kbps, music stereo 128 kbps, ambient stereo 96 kbps.
Base pack (8 clips) ≈ 583 KB (budget ≈ 1.5 MB); every part sound < 10 KB (budget 100 KB).

Loudness: effects target −18 LUFS, music/ambient −23 LUFS integrated, true peak ≤ −1 dBTP.
`hit` sits at −19.8 LUFS and `ui-tap` at −21.8 LUFS on purpose: pushing them to −18 would mean crushing the transient (hit) or making taps harsh (UI).

Loops: `music-loop` is exactly 15 bars at ~120 BPM (29.996 s) with a 250 ms equal-power seam crossfade; `ambient` is a 23.95 s ElevenLabs seamless loop with a 50 ms seam blend. Both seams verified click-free after AAC encoding.

Status: final candidates, **pending Carlos's ear approval on phone**. Loudness not yet confirmed on device.
