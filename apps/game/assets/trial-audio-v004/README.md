# trial-audio-v004

`trial-audio-v003` (all 12 trial clips + atlas-v1 part/arena sounds, **byte-identical**) plus Ludus/hangar menu music, a splash sting, a Tale of the Tape face-off sting, and a full UI button family, so splash, the Ludus and the rest of the app are no longer silent.

AI-generated with ElevenLabs (Creator plan, commercial use) on 2026-11-18 under Carlos's go (generation approved 2026-11-17; this pack answers his 2026-11-18 APK note that fight music/FX were good but menus and most buttons were silent).

## New in v004

| File | Trigger | Duration (s) | Loudness (LUFS) | True peak (dBTP) | Channels |
|---|---|---|---|---|---|
| `clips/menu-loop.m4a` | `menu_music_loop` | 49.994 | -23.0 | -7.6 | stereo |
| `clips/splash-sting.m4a` | `splash_sting` | 2.485 | -20.0 | -6.5 | mono |
| `clips/face-off-sting.m4a` | `tale_of_the_tape` | 2.48 | -20.0 | -4.3 | mono |
| `clips/ui-confirm.m4a` | `ui_primary_confirm` | 0.418 | -18.1 | -2.1 | mono |
| `clips/ui-back.m4a` | `ui_back` | 0.325 | -22.2 | -3.1 | mono |
| `clips/ui-tab.m4a` | `ui_tab_selected` | 0.163 | -22.3 | -3.4 | mono |
| `clips/ui-snap.m4a` | `ui_carousel_snap` | 0.163 | -25.5 | -5.9 | mono |
| `clips/ui-create.m4a` | `create_bot_pressed` | 0.557 | -18.4 | -1.8 | mono |
| `clips/ui-error.m4a` | `ui_action_blocked` | 0.464 | -22.1 | -4.3 | mono |
| `clips/ui-toggle.m4a` | `settings_toggle` | 0.093 | -22.5 | -2.7 | mono |

Effects: AAC-LC `.m4a`, 44.1 kHz, mono, 96 kbps. `menu-loop`: stereo 128 kbps. True peak ≤ −1 dBTP.

`menu-loop` is a calm-but-confident Ludus / hangar loop in the same metallic / scrap-metal family as the fight loop, at 96 BPM (20 bars, 49.994 s) with a 250 ms equal-power seam. `splash-sting` is a 2.48 s logo intro that can lead into it. `face-off-sting` is a 2.48 s two-phrase sting for the Tale of the Tape screen, same family but more confrontational, played over the menu loop. UI ticks sit quieter than combat FX: `ui-confirm` and `ui-create` at about −18 LUFS; back/tab/toggle/error at about −22; `ui-snap` at −25.5 so a snapping carousel does not shout. Reuse existing `ui-tap` for generic secondary buttons, `select` for part/paint cards, and `equip` for a successful EQUIP.

Unchanged from v003: `clips/{swing,hit,dodge,defeat,hush,ui-tap,win,music-loop,new-record,xp-tick,equip,select}.m4a`. Part/arena atlas clips still load from the sealed `trial-audio-v003` atlas-v1 tree in the client (not re-shipped in this pack directory).

Contents: `clips/`, `manifest.json`, `PROVENANCE.md`, `INTEGRATION.md`, `SHA256SUMS`.

Status: final candidates, pending Carlos's ear approval on phone.
