# Architecture overview

Implementation layout for this repo. Canonical decisions:
[Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892).

## Where things run (agreed target)

| Module                               | Runs                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| `apps/game`                          | Expo / React Native client (iOS/Android; web is preview) |
| combat-v1 (`packages/combat-engine`) | In a **Supabase Edge Function**                          |
| Fight persist                        | **Postgres function**, one atomic transaction            |
| Outbox                               | **pg_cron**                                              |
| Media packs                          | Supabase Storage **`atlas/vN/`**                         |
| `apps/dashboard`                     | Next.js, read-only                                       |
| `supabase/migrations`                | Ordinary SQL; local via Supabase CLI                     |

Bots are data. Image and audio packs are versioned and modular.
`docs/architecture/combat-v1.md` is the fight spec.
`docs/audio/README.md` is the audio file index.
Backend health / smoke / coverage: `docs/backend/verify.md`.

Bots-as-data tables (F1): `parts_catalogue`, `inventory_ledger`,
`bot_loadout_versions`, plus `save_bot_loadout()` for ownership and slot
checks. Sanctioned authenticated client reads (no table GRANTs on
`characters` / `fight_allowances`): `get_owned_character()`,
`list_opponent_roster()`, `get_fight_allowance_summary(p_account_id)` —
see `docs/backend/client-read-rpcs.md`. Admin read APIs (`admin_*` views,
`admin_dashboard_snapshot()`, `backend_health_snapshot()`, and Edge
`/functions/v1/health`) are ready for a future dashboard UI — see
`docs/backend/admin-dashboard.md`. Dashboard pages are not built here.

Edge combat (F2/F3): `supabase/functions/combat-v1` runs deterministic
`combat-v1` with a server CSPRNG seed after `prepare_fight_context()`
validates auth, ownership, eligibility, and allowance availability, then
calls `persist_fight_result()` in one Postgres transaction (allowance
consume, battle/replay, attacker XP, outbox, idempotency). Output is a full
semantic replay with `status: completed` and `persistence: persisted|repeated`.

Outbox drain and allowance refresh run on **pg_cron** (`botore-outbox-drain`,
`botore-allowance-refresh`) via `process_analytics_outbox()` and
`ensure_fight_allowances()`. Failed outbox rows stay visible
(`last_error` / `dead_lettered_at`); no Fastify worker.

Media packs (F5): versioned `atlas/vN/` in Supabase Storage with an immutable
published manifest (`atlas_versions` / `atlas_manifest_entries`). Fights pin
`battle_participants.atlas_version`. See `docs/architecture/atlas.md`.

Android release-build phone perf (F12): proposed thresholds, measurement
protocol, parked native acceptance checks, and cost ledger —
`docs/architecture/android-release-perf.md`. Agree limits on ClickUp before
treating device numbers as acceptance; Expo web is not a substitute.

This checkout still contains leftover Fastify `apps/api` and `apps/worker`.
Do not extend them. Target path: client → Edge Function → Postgres function
→ pg_cron.

## Boundaries

Enforced by `scripts/check-boundaries.mjs`. See `AGENTS.md`.

| Path                                         | May import                   | Must not import                                              |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `packages/{rng,domain,replay,combat-engine}` | `@botore/*`, `@noble/hashes` | frameworks, `pg`, `@supabase/*`, IO, clocks, `Math.random()` |
| `apps/game/src`                              | replay, Expo/RN              | server, `pg`, `@supabase/*`                                  |
| `apps/dashboard/lib`                         | `pg` (reporting)             | service-role keys, write APIs                                |

CSPRNG for fight seeds belongs in the Edge Function. Leftover
`apps/api/src/seeds.ts` is not the place to add more.
