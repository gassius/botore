# Atlas media packs (`atlas/vN/`)

Backend layout for versioned image and audio packs. Product authority:
[Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892) §4.
Audio path conventions: `docs/audio/README.md`.

## F5/F6 contract (do not invent alternate APIs)

| Step               | Who                                   | What                                                                                                        |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Register draft  | Migration `0017`                      | Inserts `atlas_versions` (`status=draft`) + `atlas_manifest_entries`. **No** `storage.objects` fabrication. |
| 2. Upload payloads | `node scripts/seed-atlas-storage.mjs` | Storage **API** upload of every manifest path under `atlas/vN/…`, then download verify.                     |
| 3. Publish         | `publish_atlas_version(vN)`           | `service_role` only. Locks the version row, requires every path present in Storage, then freezes.           |
| 4. Read / pin      | Clients / fights                      | `get_atlas_manifest(vN)` and authenticated `save_bot_loadout` accept **published** only.                    |

`service_role` may confirm loadouts against a draft during seed (before bootstrap publishes). F6 loaders must not invent a second publish path or write Storage metadata via SQL.

Published packs are **immutable**: triggers reject insert/update/delete of manifest entries and Storage objects when the **source or destination** version/prefix is published. Publication and mutations share `atlas_lock_versions()` (`SELECT … FOR UPDATE` in sorted order) so an in-flight draft mutation either finishes before publish or is rejected after.

## Storage

| Item            | Value                                               |
| --------------- | --------------------------------------------------- |
| Bucket          | `atlas` (private)                                   |
| Object prefix   | `vN/…` (example: `v1/parts/chassis-basic/body.png`) |
| Manifest object | `vN/manifest.json`                                  |
| Base pack       | `vN/base/` (UI / music / generic FX fallbacks)      |
| Part packs      | `vN/parts/<partId>/`                                |
| Arenas          | `vN/arenas/<arenaId>/`                              |
| Fight FX        | `vN/fx/`                                            |

## Database

| Relation / RPC                         | Purpose                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `atlas_versions`                       | Version registry + JSON manifest (`budgets_final` stays false until approved)      |
| `atlas_manifest_entries`               | Part / base / arena / FX → file path map                                           |
| `atlas_missing_storage_paths(version)` | Paths lacking Storage objects (publish gate / health)                              |
| `atlas_lock_versions(text[])`          | Sorted per-version row locks for publish + mutations                               |
| `get_atlas_manifest(version)`          | Published manifest + entry list for clients                                        |
| `publish_atlas_version(version)`       | `service_role` draft → published after object check                                |
| `battle_participants.atlas_version`    | Fight-time media version pin (from loadout)                                        |
| `admin_atlas_overview`                 | Ops/readiness for a future B2 dashboard                                            |
| `admin_dashboard_snapshot()`           | Bundles atlas versions with health / fights / cron for B2 (see admin-dashboard.md) |

## Proof pack (v1 placeholders)

Local/CI after bootstrap:

- 1 chassis, 2 paints, sword / axe / dagger
- Quiet arena
- Hit / dodge / defeat FX (image + base-pack AAC fallbacks)

Bytes: `supabase/seed/atlas/v1/` (valid silent AAC `.m4a`, 1×1 PNG). No real art generation; Game Art / Audio directors own finals. Export/cache budgets remain provisional (`budgets_final = false`).

`backend_health_snapshot().checks.storage.proof_pack_ok` evaluates the seeded **`v1`** proof pack (`proof_version`), not chronological `latest_version`. Later publishes (race fixtures, ops drafts, **v2**) must not flip the gate.

## Workshop Frame pack (v2)

C13 publishes an immutable **`v2`** pack aligned to Workshop Frame **kit-v002**
media keys (migration `0024` registers the draft; Storage upload then
`publish_atlas_version('v2')`).

| Kit-relative               | Atlas pack-relative                 |
| -------------------------- | ----------------------------------- |
| `parts/{id}-{paint}.png`   | `parts/{partId}/{paint}.png`        |
| `materials/{id}-under.png` | `parts/{partId}/material-under.png` |
| `materials/{id}-over.png`  | `parts/{partId}/material-over.png`  |
| `masks/{id}-paint.png`     | `parts/{partId}/mask.png`           |

**Weapon id rule:** kit filenames keep underscores (`weapon_sword-oxide.png`);
atlas / catalogue partIds use hyphens (`parts/weapon-sword/oxide.png`). Client
adapters map both. **Do not mix kit-v001.**

Local/CI:

```bash
node scripts/pack-workshop-frame-atlas.mjs
ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs
```

Hosted Botore Development publish needs Carlos’s project URL + service-role
key (never commit). See `supabase/seed/atlas/v2/README.md`.

First-run loadouts pin **`v2`**. Fight still records
`battle_participants.atlas_version` from the sealed loadout; offline
same-version cache continues to work.

Hosted Development does not auto-run `supabase/seed.sql` or
`scripts/seed-atlas-storage.mjs` on `db push`. Run both after migrations or
health stays not-ok / Edge `/health` **503**. Runbook:
`docs/backend/verify.md` § Hosted Development bootstrap.

## Client loader (F6)

Expo on-demand download + device cache for catalogue / arena / FX packs, with
the small base pack shipped in `apps/game/assets/atlas/base/`. See
`docs/architecture/pack-loader.md`.

Stable / fight call `ensurePacks` for bots in the stable or current fight only
— Metro kit assets remain a render fallback; Storage is the long-term delivery.
