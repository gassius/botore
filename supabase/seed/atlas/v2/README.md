# Atlas v2 — Workshop Frame kit-v002

Immutable pack for first-run Workshop Frame media keys (C13).

| Concern    | Rule                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Kit pin    | **v002 only** — never mix v001 coords/assets                                                    |
| Packing    | `parts/{kitId}-{paint}.png` → `parts/{hyphenatedPartId}/{paint}.png` (same for masks/materials) |
| Weapon ids | Kit filenames use underscores (`weapon_sword`); atlas/catalogue use hyphens (`weapon-sword`)    |
| Proof pack | `v1` remains the health `proof_pack_ok` fixture                                                 |

## Generate + publish (local / CI)

```bash
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
```

`infra/db-reset.sh` runs both after publishing `v1`.

Pack output under this directory is **generated** (kit bytes + v1 carry-forward).
Do not hand-edit; re-run the pack script.

## Hosted Supabase (Carlos)

Storage upload needs the project URL + **service_role** key. Agents must not
invent or commit those secrets.

**Order matters on hosted:** migration `0026` only registers the draft +
relational manifest rows. Upload + `publish_atlas_version('v2')` (via
`seed-atlas-storage.mjs`) must finish **before** seeding or pinning any hosted
loadout to `v2`. Otherwise authenticated `save_bot_loadout` raises
`unpublished_atlas_version` and `get_atlas_manifest('v2')` returns
`atlas_version_not_published`.

```bash
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='…'   # from Dashboard → Settings → API
export DATABASE_URL='…'               # direct Postgres for publish RPC
# 1) Pack + publish v2 first
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
# 2) Only then pin / seed hosted loadouts to atlas_version = v2
```
