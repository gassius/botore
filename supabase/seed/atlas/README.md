# Atlas placeholder packs

Byte placeholders / packed kit media for Supabase Storage layout `atlas/vN/…`.

| Path                 | Role                                                          |
| -------------------- | ------------------------------------------------------------- |
| `v1/manifest.json`   | Versioned manifest (also in `atlas_versions.manifest`)        |
| `v1/base/audio/*`    | Small base-pack AAC fallbacks (UI, music, hit/dodge/defeat/…) |
| `v1/parts/<partId>/` | Proof catalogue part images + optional audio                  |
| `v1/arenas/quiet/`   | Quiet arena background + ambient                              |
| `v1/fx/`             | Hit / dodge / defeat FX placeholders                          |
| `v2/`                | Workshop Frame kit-v002 pack (generated — see `v2/README.md`) |

## Bootstrap (required)

Migrations register **draft** versions + relational manifest rows only. They do
**not** insert `storage.objects` metadata — SQL rows are not Storage payloads.

Upload + publish:

```bash
# after supabase start && db migrations
node scripts/seed-atlas-storage.mjs
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
```

That script uploads through the Storage API, verifies downloads (manifest +
image + audio), refuses publish when paths are missing, then calls
`publish_atlas_version(vN)`. `infra/db-reset.sh` and CI run v1 then v2
automatically. Hosted publish needs Carlos service-role credentials (see
`v2/README.md`).

**Hosted Development** (`yrrytppmkykzhwelqmcs`): `db push` does not run
`supabase/seed.sql` or this upload. After migrations, run the parts catalogue
seed (`psql … -f supabase/seed.sql`) then this script with project
`SUPABASE_URL` + service role key. Health stays 503 until both succeed. See
`docs/backend/verify.md` § Hosted Development bootstrap. Publish **v2** (pack +
`ATLAS_VERSION=v2 seed-atlas-storage`) before pinning any hosted loadout to
`v2` — see `v2/README.md`.

These files are **not** final art or audio. `budgets_final` stays false.
