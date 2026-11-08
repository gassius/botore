# Bundled base pack (F6)

Only this `base/` tree ships inside the Expo app bundle.

- Placeholders match `supabase/seed/atlas/v1/base/audio/` (not final audio).
- Future catalogue parts, arenas, and FX are **not** bundled here — the
  on-demand pack loader downloads them from `atlas/vN/` by manifest and caches
  them on device.
- Do not add `parts/`, `arenas/`, or `fx/` under `apps/game/assets/`.
