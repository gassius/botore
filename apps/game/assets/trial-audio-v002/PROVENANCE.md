# trial-audio-v002 — provenance / licence

| Field | Value |
|---|---|
| Owner (creative) | Music and Sound FX Director |
| Generation | **AI-generated with ElevenLabs, Creator plan, commercial use** |
| Product-owner go | Given by Carlos González Rico in the team chat, 2026-11-17 ("PLEASE DO GENERATE WHAT IS NEEDED") |
| ElevenLabs flow | `ApLrao0MW1C1XmflszJB` (Botore trial-audio-v002) |
| Credits spent | **1,192 credits total** (26 generations: 2 drafts per item; finals are processed picks, no extra generation). Account usage confirmed 1,192 of 221,939 after the run. |
| Post-processing | ffmpeg + numpy: silence trim, 3 ms fade-in / short fade-out on one-shots, loudness normalisation, true-peak guard (oversampled limiter on `hit` and `chassis-basic/hit` only), loop seam crossfades, AAC-LC encode |
| Prompt rules | No artist names, no references to existing melodies |

## Per-asset provenance

### `clips/swing.m4a` (swing)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.6, prompt_influence=0.6, loop=false
- Prompt: "Robot arm swinging a metal weapon, fast metallic whoosh with a short servo whine, punchy and dry, close-mic"
- Generations: chosen `NHLUYmfOi3SvbGSuJWwh`; other draft `9aa1AAGwf0F3G8H9dLZw` (node `dDboBMbvr1RIkSjnoBHp`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: clear whoosh build-and-decay shape (peak at ~60 ms), fewer artefacts in the tail than d2's flatter, noisier swipe.
- Output: 0.5 s, -18.3 LUFS, -2.2 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/hit.m4a` (hit)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.6, prompt_influence=0.6, loop=false
- Prompt: "Metal weapon striking a robot's steel armor, loud metallic clank impact with a crunchy servo rattle, punchy cartoon game hit"
- Generations: chosen `O8Zle9FnwrU6XAPopuDM`; other draft `7ORhoOLYQ4A1ddo3pU11` (node `OtS4R3VVbVrjie4QHEir`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: tighter decay (punchier, -40 dB by ~0.3 s) than d2's longer ringing tail; both clipped at source, d1 limited cleanly.
- Output: 0.6 s, -19.8 LUFS, -1.4 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/dodge.m4a` (dodge)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.5, prompt_influence=0.6, loop=false
- Prompt: "Robot quickly sidestepping, fast servo motor zip with a short air swoosh and a light metal foot scuff"
- Generations: chosen `FFGfC9ALf3M8UkEX2UDd`; other draft `b8VfZflD89IpQfgMOTox` (node `QaYv7cQGRAXI4gOI89X0`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: rise→fall 'zip' contour with a tonal servo element; d2 starts at full level (click risk) and is flat/noisy.
- Output: 0.431 s, -18.3 LUFS, -4.9 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/defeat.m4a` (defeat)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=2.0, prompt_influence=0.5, loop=false
- Prompt: "Robot powering down, descending motor whir slowing to a stop with electric sparks crackling and a final heavy metal clunk"
- Generations: chosen `mHgecCFNebmxz2RT6tIS`; other draft `gplhxAnv3WVjjYqws6aB` (node `KGkqfRmUn0c145BuHu2l`)
- Credits: 7 per generation × 2 drafts = 14
- Why this draft: d1: steady descending envelope = power-down whir that settles to silence inside 2 s; d2 holds level then cuts off.
- Output: 2.0 s, -18.1 LUFS, -1.8 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/hush.m4a` (hush)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=1.5, prompt_influence=0.5, loop=false
- Prompt: "Tense moment before a fight, low rising metallic drone swell with a soft hydraulic exhale, quiet and suspenseful"
- Generations: chosen `qocq2UHg4xr0cfy3AKnK`; other draft `kTsZvtNTWhUWTJdAcjeo` (node `40lnAcXLvG1IRoAdX7DK`)
- Credits: 5 per generation × 2 drafts = 10
- Why this draft: d1: rising tension swell from near-silence into the first strike; d2 is a clipped boom (2,700 clipped samples), not a hush.
- Output: 1.466 s, -18.1 LUFS, -1.1 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-tap.m4a` (uiTap)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Single soft mechanical button click, small muted plastic and metal tick, gentle UI tap"
- Generations: chosen `uDR4ZImEDGjDVu8heKPm`; other draft `yz6Y17IfdQmHlZadgKrv` (node `ARHswaWLts3gkJ70O56l`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: one clean single click (trimmed to 120 ms); d2 contains two separate clicks (a double-tap).
- Output: 0.12 s, -21.8 LUFS, -1.0 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/win.m4a` (win)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=2.5, prompt_influence=0.5, loop=false
- Prompt: "Short triumphant victory fanfare stinger played on brassy synth with metallic anvil hits and a rising servo whir, upbeat game win jingle"
- Generations: chosen `SKoo4bWIqzQk6KV720eN`; other draft `q7l8NuKoeZcLl3su8EXs` (node `wTINvqV7EjQPJQAUzqu0`)
- Credits: 8 per generation × 2 drafts = 16
- Why this draft: d2: sustained tonal fanfare body (~1.7 s) then natural decay, no source clipping; d1 is front-loaded, clipped and decays after 0.5 s.
- Output: 2.48 s, -18.0 LUFS, -4.8 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/music-loop.m4a` (musicLoop)
- Model: `eleven_music_v2_5` — settings: duration_seconds=32, instrumental=true, lyrics_type=instrumental; processed to a 15-bar loop (29.996 s), 250 ms seam crossfade, loudnorm two-pass to −23 LUFS
- Prompt: "Instrumental industrial arena battle loop at 120 BPM, energetic and slightly playful. Driving metallic percussion with clanking scrap-metal hits, punchy kick and snare, gritty distorted synth bass riff, short stabby synth accents. Constant high energy from start to end with no intro, no outro and no fade, so it loops seamlessly."
- Generations: chosen `JnBw3v7nIb30yAhqdxRF`; other draft `CrxB1wBEtR4bOVNJwgEZ` (node `exKPc92frIm3BZLKXkdJ`)
- Credits: 480 per generation × 2 drafts = 960
- Why this draft: d1: both ~120 BPM; d1's 15-bar loop seam matches far better (seam correlation 0.81 vs 0.63, no audible jump) so it loops cleanly.
- Output: 29.996 s, -23.0 LUFS, -9.8 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `atlas-v1/parts/weapon-sword/swing.m4a` (parts/weapon-sword/swing.m4a)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.6, prompt_influence=0.6, loop=false
- Prompt: "Clean steel sword whoosh through air, bright thin metallic ring, single fast swipe, close-mic"
- Generations: chosen `d5fw2VHDybmLePuIQ9wN`; other draft `UsI9H3sD5eGs2zEakqfA` (node `ziLA2r33OLTNuRY8loCx`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: tonal metallic ring (spectral flatness 0.06 vs 0.12) with a proper wind-up→swipe→decay; d2 is a short noisy puff.
- Output: 0.438 s, -18.1 LUFS, -2.9 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `atlas-v1/parts/weapon-axe/swing.m4a` (parts/weapon-axe/swing.m4a)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.7, prompt_influence=0.6, loop=false
- Prompt: "Heavy iron axe swung hard, deep chunky low whoosh with a hydraulic servo grunt, weighty and slow"
- Generations: chosen `GVPlKpQCxzZIUPgBAbys`; other draft `mCm13Q3SyrC9p0i65yYd` (node `uJo950HoYDmg4Kzuv5j5`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: lowest spectral centroid (~2.4 kHz) and a slow heavy swell, reads 'heavy'; d2 starts at full level with a hard click.
- Output: 0.576 s, -18.0 LUFS, -4.8 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `atlas-v1/parts/weapon-dagger/swing.m4a` (parts/weapon-dagger/swing.m4a)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.5, prompt_influence=0.6, loop=false
- Prompt: "Quick light dagger flick, tiny sharp high whoosh with a small mechanical tick, very short"
- Generations: chosen `qsVVpAnW0FTqjaGrhKR2`; other draft `9czRM2aqr75DKqmUdd0V` (node `KEQOwalcnYrxFqi3ekU1`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: fast bright flick that dies in ~150 ms; d2 is mostly broadband noise (flatness 0.37) and 6 dB quieter.
- Output: 0.214 s, -18.5 LUFS, -1.3 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `atlas-v1/parts/chassis-basic/hit.m4a` (parts/chassis-basic/hit.m4a)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=0.6, prompt_influence=0.6, loop=false
- Prompt: "Light sheet-metal robot body getting hit, hollow tinny clang with loose bolts rattling, short"
- Generations: chosen `ukf207fpB2eWK0sbvU5r`; other draft `MOHbJYNhhYYg2vWiNPfN` (node `xSY6Cs2jW8uBsLKCJZLq`)
- Credits: 2 per generation × 2 drafts = 4
- Why this draft: d1: brighter, more tonal tinny clang (centroid 1.25 kHz, flatness 0.13) fits a light sheet-metal chassis better than d2.
- Output: 0.5 s, -18.2 LUFS, -2.4 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `atlas-v1/arenas/quiet/ambient.m4a` (arenas/quiet/ambient.m4a)
- Model: `eleven_text_to_sound_v2` — settings: duration_seconds=24, prompt_influence=0.4, loop=true
- Prompt: "Low scrapyard garage room tone, soft electrical hum, occasional distant metal clanks and creaks, steady and calm"
- Generations: chosen `I1iVXugzt78eJwPW0gYl`; other draft `lrO0U2K8bQmuF0ICmKYb` (node `Y1Ff1cNicJrQcRJ49RwM`)
- Credits: 80 per generation × 2 drafts = 160
- Why this draft: d2: steady room tone with audible level movement from distant clanks; d1 is flatter/emptier. Both seam-checked clean.
- Output: 23.95 s, -23.1 LUFS, -7.2 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

## Policy reminders

- Missing / failed audio must never block or desync the fight.
- This pack is immutable once sealed; further changes go into `trial-audio-v003+`.
- Drafts (both takes for every item) are kept outside the repo in `/workspace/botore/audio/drafts/` for re-picks by ear.
