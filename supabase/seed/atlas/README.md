# Atlas placeholder packs

Byte placeholders for Supabase Storage layout `atlas/vN/…`.

| Path                 | Role                                                          |
| -------------------- | ------------------------------------------------------------- |
| `v1/manifest.json`   | Versioned manifest (also stored in `atlas_versions.manifest`) |
| `v1/base/audio/*`    | Small base pack fallbacks (UI, music, hit/dodge/defeat/…)     |
| `v1/parts/<partId>/` | Proof catalogue part images + optional audio                  |
| `v1/arenas/quiet/`   | Quiet arena background + ambient stub                         |
| `v1/fx/`             | Hit / dodge / defeat FX placeholders                          |

These files are **not** final art or audio. Export sizes and cache budgets
remain provisional (`budgets_final = false` in `atlas_versions`).

Schema, RLS/policies, immutability, and DB manifest rows are applied by
migration `0017_atlas_media_packs.sql`. That migration also registers
matching `storage.objects` keys for local/CI. Upload these bytes to a hosted
bucket when promoting a pack outside local seed metadata.
