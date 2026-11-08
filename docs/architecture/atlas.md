# Atlas media packs (`atlas/vN/`)

Backend layout for versioned image and audio packs. Product authority:
[Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892) §4.
Audio path conventions: `docs/audio/README.md`.

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

Published versions are **immutable**: DB triggers freeze `atlas_versions`,
`atlas_manifest_entries`, and `storage.objects` under a published `vN/`
prefix. Clients may read; only `service_role` publishes new drafts.

## Database

| Relation / RPC                      | Purpose                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `atlas_versions`                    | Version registry + full JSON manifest (`budgets_final` stays false until approved) |
| `atlas_manifest_entries`            | Part / base / arena / FX → file path map                                           |
| `get_atlas_manifest(version)`       | Published manifest + entry list for clients                                        |
| `publish_atlas_version(version)`    | `service_role` draft → published                                                   |
| `battle_participants.atlas_version` | Fight-time media version pin (from loadout)                                        |
| `admin_atlas_overview`              | Ops/readiness for a future B2 dashboard                                            |

`save_bot_loadout` requires a **published** atlas version. Confirmed loadouts
and fights therefore always reference a frozen pack.

## Proof pack (v1 placeholders)

Seeded for local/CI:

- 1 chassis, 2 paints, sword / axe / dagger
- Quiet arena
- Hit / dodge / defeat FX (image + base-pack audio fallbacks)

Placeholder bytes: `supabase/seed/atlas/v1/`. No real art generation in
engineering tickets; Game Art / Audio directors own final assets.
