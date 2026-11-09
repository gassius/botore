# trial-audio-v001 — provenance / licence

Produced for ClickUp [F11 · Integrate trial audio pack into replay](https://app.clickup.com/t/1amjtrexzu7).
Creative direction: [Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072)
(mood “Scrapyard arena” is provisional until Art Direction alignment).

## Licence / rights

| Field | Value |
| ----- | ----- |
| Owner (creative) | Music and Sound FX Director |
| Owner (playback wiring) | Engineering |
| Generation | **None.** No ElevenLabs / paid API call. |
| Credit cost | `null` (unknown ≠ zero — none spent) |
| Product-owner go | **Not given** — placeholders only until Carlos approves finals by ear |
| Source bytes | Byte-identical silent AAC `.m4a` stubs copied from `supabase/seed/atlas/v1/base/audio/*` (F5 proof pack) |
| Commercial clearance | N/A for silent engineering stubs; finals must record prompt, settings, and licence under Carlos’s ElevenLabs plan |

## Per-asset provenance

Every clip below is a **silent AAC placeholder** (44.1 kHz). Same container checksum across stubs; not final art.

| Clip id | File | Trigger | Prompt / settings | Licence |
| ------- | ---- | ------- | ----------------- | ------- |
| `swing` | `clips/swing.m4a` | `attack_selected` | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `hit` | `clips/hit.m4a` | `damage_applied` | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `dodge` | `clips/dodge.m4a` | `dodged` | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `defeat` | `clips/defeat.m4a` | `character_defeated` | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `hush` | `clips/hush.m4a` | before first attack | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `uiTap` | `clips/ui-tap.m4a` | UI buttons | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `win` | `clips/win.m4a` | `battle_ended` (win) | n/a (silent stub) | Engineering placeholder; regenerate under owner go |
| `musicLoop` | `clips/music-loop.m4a` | fight screen loop | n/a (silent stub) | Engineering placeholder; regenerate under owner go |

## Policy reminders

- Missing / failed audio must never block or desync the fight.
- Do not run paid generation without recorded credit cost **and** explicit Carlos go.
- Replace stubs in a **new** version (`trial-audio-v002+`); keep this pack immutable once sealed.
