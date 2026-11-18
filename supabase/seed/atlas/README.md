# Atlas placeholder packs

Byte placeholders / packed kit media for Supabase Storage layout `atlas/vN/…`.

| Path                 | Role                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `v1/manifest.json`   | Single Development atlas (proof + Workshop Frame kit-v003)                   |
| `v1/base/audio/*`    | Small base-pack AAC fallbacks (UI, music, hit/dodge/defeat/…)                |
| `v1/parts/<partId>/` | Proof catalogue + workshop-frame hyphenated parts (packed overlays)          |
| `v1/arenas/quiet/`   | Quiet arena background + ambient                                             |
| `v1/fx/`             | Hit / dodge / defeat FX placeholders                                         |
| `v2/`                | **Retired** — README only (kit-v002 history; do not pack/publish)            |
| `v3/`                | **Retired** — README only (former active pack; contents live on `v1` now)    |

## Bootstrap (required)

Migrations register **draft** `v1` + relational manifest rows (proof in `0017`,
workshop-frame layers in `0031`). They do **not** insert `storage.objects`
metadata — SQL rows are not Storage payloads.

Upload + publish:

```bash
# after supabase start && db migrations
node scripts/pack-workshop-frame-atlas.mjs          # overlay kit-v003 onto v1
ATLAS_VERSION=v1 node scripts/seed-atlas-storage.mjs
```

That script uploads through the Storage API, verifies downloads (manifest +
image + audio), refuses publish when paths are missing, then calls
`publish_atlas_version(v1)`. `infra/db-reset.sh` and CI run pack + v1 publish
automatically. Hosted Development re-publish of an already-published `v1` needs
the Dev-only reopen runbook in `docs/backend/verify.md` (Carlos / Infra
credentials — never commit secrets).

**Hosted Development** (`yrrytppmkykzhwelqmcs`): `db push` does not run
`supabase/seed.sql` or this upload. After migrations, run the parts catalogue
seed (`psql … -f supabase/seed.sql` or SQL connector) then pack + seed with
project `SUPABASE_URL` + service role key. Health stays 503 until both succeed.
See `docs/backend/verify.md` § Hosted Development bootstrap / atlas v1 reset.

These files are **not** final art or audio. `budgets_final` stays false.
