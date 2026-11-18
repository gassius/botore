# trial-audio-v004 — provenance / licence

| Field | Value |
|---|---|
| Generation | **AI-generated with ElevenLabs, Creator plan, commercial use** |
| Product-owner go | Carlos González Rico, team chat, 2026-11-17 (generation) and 2026-11-18 (this menu/UI pack after APK review) |
| ElevenLabs flow | `ApLrao0MW1C1XmflszJB` |
| Credits, v004 additions | **1,700** (24 generations: 2 drafts × 10 items, plus 2 rejected nearly-silent ui-tab drafts, 2 ui-tab replacements, 2 rejected sub-bass face-off drafts and 2 mid-register replacements). Account usage after the run: 2,916 of 221,939 |
| Credits, whole pack | 2,916 (v002 1,192 + v003 24 + v004 1,700) |
| Models | `eleven_music_v2_5` (menu-loop), `eleven_text_to_sound_v2` (sting + UI) |
| Post-processing | ffmpeg + numpy: silence trim, short fade-in/out, BS.1770 loudness normalisation, true-peak guard (oversampled limiter on `ui-confirm`, `ui-tab`, `ui-create`, `ui-back`), 250 ms equal-power loop seam on `menu-loop`, AAC-LC 96 kbps mono / 128 kbps stereo |
| Prompt rules | No artist names, no references to existing melodies |

## New assets (v004)

### `clips/menu-loop.m4a` (menuLoop, trigger `menu_music_loop`)
- Model: `eleven_music_v2_5`; settings: duration_seconds=54, instrumental=true, lyrics_type=instrumental; processed to a 20-bar loop (49.994 s) at 96 BPM, 250 ms seam crossfade, loudnorm two-pass to −23 LUFS
- Prompt: "Instrumental industrial hangar lobby loop at 96 BPM, calm but confident, same sonic family as a metallic scrap-metal arena track but quieter and more spacious. Soft metallic percussion with muted clanks, a steady mid-tempo kick, warm gritty synth bass ostinato, and restrained stabby synth accents. Constant even energy from start to end with no intro, no outro, no vocals and no fade, so it loops seamlessly."
- Generations: chosen `rmfX3yZj1XcemzZ9Qcj5`; other draft `Tz97hE3LJx5hrwKUaTJ9` (node `LiQQF1dxf8XUhRW6Y6nl`)
- Credits: 810 per generation × 2 = 1620
- Why this draft: Both drafts sit at ~96.8 BPM with even start/end energy. d2's 20-bar loop seam is clearly tighter (correlation 0.80 vs 0.68) and stays click-free after a 250 ms equal-power crossfade.
- Output: 49.993 s, -23.0 LUFS, -7.6 dBTP; loop 49.994 s, seam correlation 0.796, 20 bars @ 96 BPM
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/splash-sting.m4a` (splashSting, trigger `splash_sting`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=2.5, prompt_influence=0.6, loop=false
- Prompt: "Short 2.5 second game logo intro sting, two rising metallic synth notes with a soft anvil tick and a brief servo whir that settles into a hangar-ready chord, confident and not harsh, close-mic, no vocals"
- Generations: chosen `7aizsX8w9EglsXiI3Ler`; other draft `Pq0QsvoqVBFd2FUP7UWS` (node `QADK8HmMvsXZKkuhCd6U`)
- Credits: 8 per generation × 2 = 16
- Why this draft: d1 is a single sting phrase with a natural decay that can lead into the menu loop. d2 is two uneven pulses and busier (29 envelope attacks vs 8).
- Output: 2.48 s, -20.0 LUFS, -6.5 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/face-off-sting.m4a` (faceOffSting, trigger `tale_of_the_tape`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=2.5, prompt_influence=0.75, loop=false
- Prompt: "Short 2.5 second face-off sting in the mid register, two clashing metallic synth notes at a mid pitch with a soft anvil tick and a tense servo whir, same industrial hangar family as a logo intro but more confrontational, clearly audible on a small phone speaker, no sub-bass rumble, no vocals, close-mic"
- Rejected first drafts: `PdEnPz1dHabbyrSSPkUc`, `b6sdgQAq6FBXKtP9D5iA` on node `Kt7bxbVJjh75Ufkl2RZ7` (about 98% of energy below 80 Hz, inaudible on a phone speaker). Replacement node below. Credits: 8 × 2 original + 8 × 2 replacement = 32.
- Generations: chosen `5Ect7mwe4oZ4cIfjN7vk`; other draft `V6CkFkutedn9fQ82cOKk` (node `k4VYLfd5TaCQ2DvRUxaZ`)
- Credits: 8 per generation; 32 total including rejected first pair
- Why this draft: The first two drafts (node Kt7bxbVJjh75Ufkl2RZ7) were almost entirely sub-bass (about 98% of energy below 80 Hz) and would be inaudible on a phone speaker, so they were rejected. The replacement mid-register node produced two usable takes. d3 is a clear two-phrase sting (a hit, a brief dip, a stronger lock, then a natural decay) with most energy in the mid band, in the same family as the splash sting but more confrontational. d4 is a single brighter high-mid hit that just decays, with less of a face-off shape.
- Output: 2.48 s, -20.0 LUFS, -4.3 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-confirm.m4a` (uiConfirm, trigger `ui_primary_confirm`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.55, prompt_influence=0.7, loop=false
- Prompt: "Single satisfying mid-pitch mechanical confirm click with a short soft servo lock, muted metal and plastic, positive UI confirm, close-mic"
- Generations: chosen `BnJxR4bude3HH9V8oGCU`; other draft `tUaDracpMNLllJx4WFPR` (node `D0lSgClE69UMvAcbUhcp`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1 is one confirm with a short servo pre-roll into a lock click. d2 is a continuous rattle (unsuitable for a primary button). Source clipping on d1 was removed with an oversampled limiter.
- Output: 0.4 s, -18.1 LUFS, -2.1 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-back.m4a` (uiBack, trigger `ui_back`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Single soft lower mechanical click with a short downward tick, muted metal, gentle UI back or dismiss, close-mic"
- Generations: chosen `G65O8vlhyGpuIwaM8H4T`; other draft `UCy7MbefJTFsHJLs0M0f` (node `bi6y87bce3kaZdxj13c0`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d2 is a single downward click with a tiny echo. d1 is a noisy burst 25 dB quieter (peak 0.039) and would need a large gain raise into the noise floor.
- Output: 0.314 s, -22.2 LUFS, -3.1 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-tab.m4a` (uiTab, trigger `ui_tab_selected`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.8, loop=false
- Prompt: "Clear single short metallic click, muted steel tab changing, audible dry tick like a light mechanical switch, close-mic UI tab change, not quiet, not a chord, one click only"
- Rejected first drafts: `pYurbT9GfQes256qhVDC`, `JBpYMcP5HrH9gMJt91HB` on node `mlBVKn6U2tMJAjnImD1n` (near-silent hum, about −60 LUFS). Replacement node below. Credits: 2 × 2 original + 2 × 2 replacement = 8.
- Generations: chosen `PEjlxuPfrr2WOeMVoHHo`; other draft `CP4H2UuzfL0bT1FBnm0l` (node `CrD1MoM0N0MkLaovwtri`)
- Credits: 2 per generation; 8 total including rejected first pair
- Why this draft: The first two drafts (node mlBVKn6U2tMJAjnImD1n) were near-silent low hum (about -60 LUFS, peak 0.01-0.016) and were rejected. A second node with a stronger prompt produced two real clicks. d4 (this take) is a short mid-metallic tick (centroid ~4.5 kHz, 0.15 s) that stays distinct from the brighter ui-snap; d3 is sharper but rings longer and clips slightly more.
- Output: 0.157 s, -22.3 LUFS, -3.4 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-snap.m4a` (uiSnap, trigger `ui_carousel_snap`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Very short tiny muted metal detent tick, almost a whisper, single carousel snap, close-mic"
- Generations: chosen `xNCecor15XkgeO83ZV5W`; other draft `Tyjp9x7xjqeIIMsJycQ2` (node `tMkCfGyEgdn4XS9qQQUN`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d2 is a single immediate detent (effective ~0.15 s). d1 lands ~180 ms late, which would feel laggy on a snapping carousel.
- Output: 0.15 s, -25.5 LUFS, -5.9 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-create.m4a` (uiCreate, trigger `create_bot_pressed`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.6, prompt_influence=0.6, loop=false
- Prompt: "Short constructive mechanical confirm, small ratchet click and a brief rising servo whir, soft workshop create sound, close-mic"
- Generations: chosen `U8Iaa6TCRfyGCOLoRN35`; other draft `ZZhpe6sgaHHC7GrzOtIO` (node `GBhBhqA6PqZ1wwLuNxIc`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1 is a clean ratchet of distinct clicks that ends once. d2 is a longer, messier machine-gun with leftover ticks after the phrase.
- Output: 0.55 s, -18.4 LUFS, -1.8 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-error.m4a` (uiError, trigger `ui_action_blocked`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Soft low muted buzz-click, gentle blocked action, not harsh, short and dry, close-mic"
- Generations: chosen `XHPS2qQzq95qHk0yEIoA`; other draft `xWNUBqD7jrShN51F4KqT` (node `auvW3aGVy1NokDPv5hnZ`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1 is a soft buzz-click with a gentle start, matching a blocked action without sounding like an alarm. d2 is a pure tone that starts at full level.
- Output: 0.45 s, -22.1 LUFS, -4.3 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/ui-toggle.m4a` (uiToggle, trigger `settings_toggle`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Soft two-stage mechanical switch click, muted metal toggle, short and gentle, close-mic"
- Generations: chosen `Yq1r2616JDao1eTqPVmu`; other draft `00rNn2H8GW1sZ0udFsP6` (node `MOpJIkeEtcnvay0MkWHt`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1 is an immediate single switch click (~90 ms) with no clipping. d2 is the same idea but late (~320 ms lead) and clipped.
- Output: 0.087 s, -22.5 LUFS, -2.7 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use


## Inherited from trial-audio-v003 (unchanged files)

| Field | Value |
|---|---|
| Generation | **AI-generated with ElevenLabs, Creator plan, commercial use** |
| Product-owner go | Carlos González Rico, team chat, 2026-11-17 |
| ElevenLabs flow | `ApLrao0MW1C1XmflszJB` |
| Credits, v003 additions | **24** (8 generations: 2 drafts × 4 items). Account usage after the run: 1,216 of 221,939 |
| Credits, whole pack | 1,216 (v002 1,192 + v003 24) |
| Model | `eleven_text_to_sound_v2` |
| Post-processing | ffmpeg + numpy: silence trim, 3 ms fade-in, short fade-out, BS.1770 whole-clip loudness normalisation, true-peak guard (oversampled limiter on `equip` only), AAC-LC 96 kbps mono |

## New assets (v003)

### `clips/new-record.m4a` (newRecord, trigger `result_new_record`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=1.8, prompt_influence=0.6, loop=false
- Prompt: "Bright achievement unlocked chime, two quick rising metallic dings with a fast ratchet click flourish and a short servo whir, cheerful game reward sound"
- Generations: chosen `iBH03nYXMocBLo9NoFip`; other draft `anNlPwl78SeJcJeLo0Qp` (node `bQ9AQi1G4wZPDdhFhI4c`)
- Credits: 6 per generation × 2 = 12
- Why this draft: d2: tonal two-phrase chime (spectral flatness 0.09 vs 0.24), soft clean start and far less source clipping; d1 starts at full level, noisy and clipped.
- Output: 1.76 s, -18.2 LUFS, -2.6 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/xp-tick.m4a` (xpTick, trigger `xp_bar_step`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Single tiny soft metallic tick, light counter click, very short and gentle, close-mic"
- Generations: chosen `rlZscYum39xbjAjc1moN`; other draft `oFljvXMVmH3wTbLoyW5K` (node `PfyGzscNSs5VzMcNYoB4`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1: single clean tick needing only -4.5 dB; d2 needed +34 dB gain (noise floor risk) for the same level.
- Output: 0.12 s, -24.9 LUFS, -5.6 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/equip.m4a` (equip, trigger `loadout_equipped`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.6, prompt_influence=0.6, loop=false
- Prompt: "Heavy metal bolt sliding and locking into place, solid mechanical clunk with a short servo confirm whir, satisfying lock-in"
- Generations: chosen `mtRs7EfTpf6LbsqBY4on`; other draft `xrHkFQBC6CPTDrfB0JYB` (node `eX6ls6rH8KbOjsXM5pfU`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1: lower, heavier clunk (centroid 3.9 kHz vs 5.0 kHz) that reads as a bolt seating; d2 is thinner and brighter.
- Output: 0.487 s, -18.3 LUFS, -1.8 dBTP (limiter ceiling 0.75)
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use

### `clips/select.m4a` (select, trigger `part_card_selected`)
- Model: `eleven_text_to_sound_v2`; settings: duration_seconds=0.5, prompt_influence=0.7, loop=false
- Prompt: "Single soft low rounded click, muted rubber button press with a faint metal tick, gentle UI select"
- Generations: chosen `kRtfewNOW9WKPeOoMiDG`; other draft `KOuosfrRdmHuepgIdWHx` (node `EpBoLsQN91FIOemSgAO1`)
- Credits: 2 per generation × 2 = 4
- Why this draft: d1: one soft low click (centroid ~0.9 kHz after trim vs ui-tap ~6 kHz, so it reads clearly different); d2 contains two clicks.
- Output: 0.18 s, -22.3 LUFS, -9.4 dBTP
- Licence: AI-generated with ElevenLabs, Creator plan, commercial use


## Inherited from trial-audio-v002 (unchanged files)

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
