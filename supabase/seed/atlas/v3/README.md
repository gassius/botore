# Atlas v3 — Workshop Frame kit-v003

Immutable pack for Workshop Frame kit-v003 grips/stances (A1).

| Concern    | Rule                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Kit pin    | **v003 only** — never mix v002/v001 coords, tiles, or pose numbers                              |
| Packing    | `parts/{kitId}-{paint}.png` → `parts/{hyphenatedPartId}/{paint}.png` (same for masks/materials) |
| Wraps      | `hand_l_wrap` / `hand_r_wrap` packed as `hand-l-wrap` / `hand-r-wrap`                           |
| Weapon ids | Kit filenames use underscores (`weapon_sword`); atlas/catalogue use hyphens (`weapon-sword`)    |
| Fallbacks  | `v1` = health proof pack; `v2` = kit-v002 history                                               |

## Generate + publish (local / CI)

```bash
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v3 node scripts/seed-atlas-storage.mjs
```

Historical v2 rebuild (optional):

```bash
ATLAS_VERSION=v2 node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
```

`infra/db-reset.sh` publishes v1, then v2, then v3.

Pack output under this directory is **generated** (kit bytes + v1 carry-forward).
Do not hand-edit; re-run the pack script. The packer preserves this README.

## Hosted Supabase (Carlos)

Storage upload needs the project URL + **service_role** key. Agents must not
invent or commit those secrets.

**Order matters on hosted:** migration `0030` only registers the draft +
relational manifest rows. Upload + `publish_atlas_version('v3')` (via
`seed-atlas-storage.mjs`) must finish **before** seeding or pinning any hosted
loadout to `v3`. Otherwise authenticated `save_bot_loadout` raises
`unpublished_atlas_version` and `get_atlas_manifest('v3')` returns
`atlas_version_not_published`.

```bash
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='…'   # from Dashboard → Settings → API
export DATABASE_URL='…'               # direct Postgres for publish RPC
# 1) Pack + publish v3 first
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v3 node scripts/seed-atlas-storage.mjs
# 2) Only then pin / seed hosted loadouts to atlas_version = v3
```
