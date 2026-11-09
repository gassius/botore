# trial-audio-v001 — game client pin (F11)

Bundled trial audio pack for replay. Separate from image atlas packs and from
`environment-v001` / Workshop Frame kits.

- Runtime clips: `clips/*.m4a` (AAC).
- Manifest: `manifest.json` (triggers, volumes, sound tags, paid-generation gate).
- Hashes: `SHA256SUMS` + sealed subset in `src/audio/trialAudioManifest.ts`.
- Active pin: `apps/game/src/audio/trialAudioPin.ts` → `trial-audio-v001`.
- Playback: fire-and-forget from animation commands; mute from shell; failures
  never await or throw into the fight clock.

Placeholders OK. Do not claim native audio acceptance or live F9→replay continuity
from this pack alone.
