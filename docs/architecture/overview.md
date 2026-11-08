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

This checkout still contains leftover Fastify `apps/api` and `apps/worker`.
Do not extend them. Target path: client → Edge Function → Postgres function.

## Boundaries

Enforced by `scripts/check-boundaries.mjs`. See `AGENTS.md`.

| Path                                         | May import                   | Must not import                                              |
| -------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `packages/{rng,domain,replay,combat-engine}` | `@botore/*`, `@noble/hashes` | frameworks, `pg`, `@supabase/*`, IO, clocks, `Math.random()` |
| `apps/game/src`                              | replay, Expo/RN              | server, `pg`, `@supabase/*`                                  |
| `apps/dashboard/lib`                         | `pg` (reporting)             | service-role keys, write APIs                                |

CSPRNG for fight seeds belongs in the Edge Function. Leftover
`apps/api/src/seeds.ts` is not the place to add more.
