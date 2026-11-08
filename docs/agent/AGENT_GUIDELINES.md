# AGENTS.md — botore

Instructions for AI coding agents (and humans) working in this repository.
The equivalent content also lives at the repository root `AGENTS.md` (that
root copy is the canonical entry point requested by the bootstrap task). Keep
both files in sync.

Authoritative ClickUp (do not invent product or architecture here):

- [Overall Product Vision](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1852)
- [Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892)

Related ClickUp:

- [Art Direction v0.1](https://app.clickup.com/90122060531/docs/2kxv30qk-232/2kxv30qk-332)
- [Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072)

Implementation notes: `docs/architecture/overview.md`, `docs/audio/README.md`.
Architecture changes are approved decision updates in ClickUp.

## Ownership

| Role                        | Owns                                                                                                                                | Does not own                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Engineer Supervisor         | Delivery: tickets, launching implementers, the cost report                                                                          | Product decisions, merging PRs                 |
| Carlos (product owner)      | Product decisions; merges every PR; yes/no on every migration                                                                       | Day-to-day ticket dispatch                     |
| Game Art Director           | Game-art spec and production (robot parts, arenas, effects, attachment points, asset manifest) within the product visual guidelines | Overall product visual guidelines, app screens |
| UI/UX and Art Supervisor    | Overall product visual guidelines; app screens; independent visual review                                                           | Game-art production (parts, arenas, effects)   |
| Music and Sound FX Director | Audio (music, SFX, sound tags, audio acceptance)                                                                                    | Visual production                              |
| Supabase Infra              | Database, RLS, migrations                                                                                                           | Product merge; client assembly                 |
| Pull Request Reviewer       | Independent review of each PR                                                                                                       | Merging (Carlos merges)                        |
| Engineering                 | Assembly, animation, playback, downloading and caching, performance                                                                 | Game-art production; audio production          |

There is no PM bot. Engineer Supervisor launches Cursor implementers; Carlos
merges.

Do not write or rewrite the Game Art Director spec, the UI/UX Art Direction
doc, or the audio guidelines from an engineering change. Follow those owners'
documents; see [Related guidelines](#related-guidelines).

## Cadence

There is no fixed daily plan. Build continuously:

- Parallel Cursor implementers run at all times. Refill a slot as soon as a
  PR opens.
- Art, audio, and engineering run in parallel against shared contracts
  (loadout, replay, and asset manifest). Use placeholders until real assets
  land.
- Review each PR when it is ready. Do not batch reviews onto a daily
  schedule.

## Reviews

PR reviews follow Carlos's standing review-request workflow: **one full
review pass** plus **one fix-verification pass**, after which only real
blockers gate. A re-review adds no new preferences.

- A blocker needs a reproduction or a failing test. For security, a
  demonstrably unsafe code path is enough.
- A blocker that remains goes to Carlos with evidence.
- Taste is a note, not a blocker.

Acceptance gates for the integrated fight are **code and data**, **visual**,
and **audio**. Check all three on the **same recorded phone replay**, with
sound on and with sound off.

## Stack

**Current:** Expo / React Native client plus Supabase.

**Fastify is dropped.** Do not add Fastify routes, a Fastify outbox worker, or
new Fastify surface. Leftover `apps/api` and `apps/worker` code is not the
target architecture — do not extend it.

- Fight resolution runs **server-side in a Supabase Edge Function** using the
  deterministic `combat-v1` engine.
- Persistence happens in **one Postgres transaction** through a database
  function: take the fight allowance with `SKIP LOCKED`, check the
  idempotency key, append to the ledgers.
- Outbox and scheduled jobs use **pg_cron**. Do not add a Fastify outbox
  worker, Redis, Kubernetes, or other message brokers.
- One CI benchmark guards the Edge Function CPU limit. It does **not** gate
  the plan.

Do not treat Cocos Creator or Fastify as the current stack.

## Bots are data

Each bot is a **server-validated loadout** (`jsonb`: chassis, paint, weapon,
shield, drone, decals, plus sound tags) that references a parts catalogue.

- Owned items live in an **append-only inventory ledger**.
- The client **never writes** loadout, catalogue, or inventory tables
  directly.
- One **server function** validates ownership and slot compatibility.
- Purchases are verified on the server later; do not trust the client for
  entitlement.
- A saved fight references an **immutable bot build and asset version**.
- The stable, the customisation preview, and the fight all use the **same
  assembly rules**.

## Asset atlas

Part PNGs, paint masks, and each part's sounds are delivered together in a
**versioned, immutable manifest and atlas** in Supabase Storage (`atlas/vN/`),
cached by the CDN.

- The client downloads **only** the parts for bots in the player's stable or
  current fight.
- The app bundle ships only a **small base pack** (UI sounds, the music loop,
  and generic hits).
- A new weapon that reuses an existing behaviour is **assets plus a manifest
  entry**. A new mechanic or an independently moving drone **needs code**.
- How much PNG-based customisation can do has to be **proven on a phone in
  the first builds** before the catalogue grows.
- Do not use SVG on the native fight path unless measurements justify it.

Engineering owns download, cache, assembly, animation, playback, and
performance of these assets. Game Art Director owns the art files and
manifest content; Music and Sound FX Director owns the sound files and sound
tags. Use placeholders until those assets land.

## Native first

Native (iOS / Android) is the ship target. The web export is **only a
preview**. Prefer device-viable patterns; do not block native work on web
parity, and do not treat web as the source of truth for fight visuals,
audio, or performance.

## Budgets

- Do not run **paid ElevenLabs generation** without Carlos's go.
- Track **cost, rework, and supervision time**. Engineer Supervisor includes
  these in the cost report.
- Mark any missing figure as **unknown, not zero**.

## Related guidelines

Owned outside Engineering. Do not edit these documents from an engineering
change; follow them.

- **Product** — [Overall Product Vision](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1852)
- **Architecture** — [Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892)
- **Audio** — Music and Sound FX Director: [Botore Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072)
- **Art Direction** (product visual guidelines, app screens, independent visual review) — UI/UX and Art Supervisor: [Art Direction v0.1](https://app.clickup.com/90122060531/docs/2kxv30qk-232/2kxv30qk-332). Visual style is still undecided.

## Package boundaries (CI-enforced)

| Path                                                                           | May import                                                              | Must never import                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/rng`, `packages/replay`, `packages/domain`, `packages/combat-engine` | each other (`@botore/*`), `@noble/hashes`                               | `fastify`, `pg`, `@supabase/*`, `next`, `react`, `node:*`, `cc`, anything with side effects |
| `apps/game/src`                                                                | `@botore/replay`, vendored pure builds, `react`, `react-native`, `expo` | `fastify`, `pg`, `@supabase/*`, server code, `cc`                                           |
| `apps/dashboard/lib`                                                           | `pg` (read-only reporting credential)                                   | service-role keys, API write paths                                                          |
| `packages/*` generally                                                         | other `packages/*`                                                      | anything from `apps/*`                                                                      |

Pure packages must not call `Math.random()`, `Date.now()`, or `new Date()`.
The only CSPRNG boundary is the fight Edge Function (`combat-v1`). Do not add
new CSPRNG sites. Leftover `apps/api/src/seeds.ts` is not the target.

Run the checker: `node scripts/check-boundaries.mjs`.

## Commands

```bash
pnpm install            # after clone
pnpm build              # turbo build
pnpm lint               # eslint + prettier check
pnpm typecheck          # tsc everywhere
pnpm test               # unit/property/golden tests (no DB needed)
pnpm env:up             # supabase start + connection info
pnpm db:reset           # migrations + seed + DB tests
pnpm verify             # format/lint/typecheck/test/boundaries/secrets/licenses
pnpm test:integration   # requires env:up && db:reset && DATABASE_URL
```

## Safe database practices

- Supabase Infra owns schema, RLS, and migrations. **Every migration needs
  Carlos's explicit yes** before it is written or merged.
- Schema changes ONLY through new files in `supabase/migrations/` with
  sequential numeric prefixes. Never edit an applied migration.
- Never `DROP` columns/tables without a deprecation migration. Architecture
  changes are approved decision updates in ClickUp.
- Seed data lives in numbered seed migrations (`1xxx_`) — idempotent.
- DB tests live in `supabase/tests/run.sql`; extend them when adding tables,
  especially RLS coverage for any new client-visible table.

## Generated files policy

- Compiled output (`dist/**`, `.next/**`) is gitignored; never commit.
- Vitest snapshots are committed and reviewed like code.
- Expo build artifacts: `.expo/` is ignored per `.gitignore`.
- Lockfile is committed; dependency changes require regenerating it.

## Task contract for agents

Each coding task should state: intended outcome, non-goals, permitted
directories, contracts/invariants touched, acceptance test command, and
whether public APIs or migrations change. Report changed files and the exact
verification command output. If the task spends money or supervision time,
report those figures or mark them unknown.

## Prohibited

- Introducing Redis/Kubernetes/microservices/GraphQL/message brokers/IAP/ads.
- Adding or extending Fastify (`apps/api`, `apps/worker`) as if it were
  current.
- Treating Cocos Creator / `cc` as the game client.
- Any cloud analytics account requirement for local development.
- Committing credentials (`.env*` except `.example`).
- Bypassing or weakening RLS policies to make a test pass.
- Client writes to loadout, inventory, catalogue, or ledger tables.
- Editing pinned versions of combat rules without a new `rulesVersion`.
  Architecture changes are approved decision updates in ClickUp.
- Paid ElevenLabs generation without Carlos's go.
- Growing the parts catalogue before PNG customisation is proven on a phone.

## Expo App Client (`apps/game`) — agent tooling

The game client is Expo (SDK 52). **Native first**; the web export is a
preview only. For Expo/EAS/RN work, also read `apps/game/AGENTS.md` and
https://docs.expo.dev/agents.md. Native-first in this file overrides any
leftover "web first" wording in Expo tooling notes.

Committed agent config:

- `apps/game/AGENTS.md` — Expo SDK docs pointers and game-client rules
- `CLAUDE.md` — imports this file for Claude Code (`@AGENTS.md`)
- `.claude/settings.json` — enables `expo@claude-plugins-official`
- `.cursor/mcp.json` — Expo MCP at `https://mcp.expo.dev/mcp`

If Expo is already configured in Cursor (MCP/Skills), no per-machine redo is
needed. Optional on _other_ machines only: Expo MCP OAuth when prompted, and
`pnpm dlx skills add expo/skills`. Local MCP automation (`expo-mcp`) needs
SDK 54+ — skip until the client is upgraded.
