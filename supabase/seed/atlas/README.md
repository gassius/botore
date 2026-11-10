# Atlas placeholder packs

Byte placeholders for Supabase Storage layout `atlas/vN/…`.

| Path                 | Role                                                          |
| -------------------- | ------------------------------------------------------------- |
| `v1/manifest.json`   | Versioned manifest (also in `atlas_versions.manifest`)        |
| `v1/base/audio/*`    | Small base-pack AAC fallbacks (UI, music, hit/dodge/defeat/…) |
| `v1/parts/<partId>/` | Proof catalogue part images + optional audio                  |
| `v1/arenas/quiet/`   | Quiet arena background + ambient                              |
| `v1/fx/`             | Hit / dodge / defeat FX placeholders                          |

## Bootstrap (required)

Migrations register **draft** `v1` + relational manifest rows only. They do
**not** insert `storage.objects` metadata — SQL rows are not Storage payloads.

Upload + publish:

```bash
# after supabase start && db migrations
node scripts/seed-atlas-storage.mjs
```

That script uploads through the Storage API, verifies downloads (manifest +
image + audio), refuses publish when paths are missing, then calls
`publish_atlas_version('v1')`. `infra/db-reset.sh` and CI run it automatically.

**Hosted Development** (`yrrytppmkykzhwelqmcs`): `db push` does not run
`supabase/seed.sql` or this upload. After migrations, run the parts catalogue
seed (`psql … -f supabase/seed.sql`) then this script with project
`SUPABASE_URL` + service role key. Health stays 503 until both succeed. See
`docs/backend/verify.md` § Hosted Development bootstrap.

These files are **not** final art or audio. `budgets_final` stays false.
