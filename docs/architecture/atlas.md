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

| Relation / RPC                         | Purpose                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `atlas_versions`                       | Version registry + JSON manifest (`budgets_final` stays false until approved) |
| `atlas_manifest_entries`               | Part / base / arena / FX → file path map                                      |
| `atlas_missing_storage_paths(version)` | Paths lacking Storage objects (publish gate / health)                         |
| `atlas_lock_versions(text[])`          | Sorted per-version row locks for publish + mutations                          |
| `get_atlas_manifest(version)`          | Published manifest + entry list for clients                                   |
| `publish_atlas_version(version)`       | `service_role` draft → published after object check                           |
| `battle_participants.atlas_version`    | Fight-time media version pin (from loadout)                                   |
| `admin_atlas_overview`                 | Ops/readiness for a future B2 dashboard                                       |

## Proof pack (v1 placeholders)

Local/CI after bootstrap:

- 1 chassis, 2 paints, sword / axe / dagger
- Quiet arena
- Hit / dodge / defeat FX (image + base-pack AAC fallbacks)

Bytes: `supabase/seed/atlas/v1/` (valid silent AAC `.m4a`, 1×1 PNG). No real art generation; Game Art / Audio directors own finals. Export/cache budgets remain provisional (`budgets_final = false`).

`backend_health_snapshot().checks.storage.proof_pack_ok` evaluates the seeded **`v1`** proof pack (`proof_version`), not chronological `latest_version`. Later publishes (race fixtures, ops drafts) must not flip the gate.
