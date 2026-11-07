# AGENTS.md — botore

Instructions for AI coding agents (and humans) working in this repository.
The equivalent content also lives at the repository root `AGENTS.md` (that
root copy is the canonical entry point requested by the bootstrap task). Keep
both files in sync.

Canonical ClickUp docs (source of truth; do not invent architecture here):
[Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892),
[Overall Product Vision](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1852),
[Art Direction v0.1](https://app.clickup.com/90122060531/docs/2kxv30qk-232/2kxv30qk-332),
[Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072).
Implementation notes: `docs/architecture/overview.md`, `docs/audio/README.md`.
Architecture decisions live in [Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892); do not invent them here.

## Package boundaries (CI-enforced)

| Path                                                                           | May import                                        | Must never import                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/rng`, `packages/replay`, `packages/domain`, `packages/combat-engine` | each other (`@botore/*`), `@noble/hashes`         | `fastify`, `pg`, `@supabase/*`, `next`, `react`, `node:*`, `cc`, anything with side effects |
| `apps/game/src`                                                                | `@botore/replay`, `react`, `react-native`, `expo` | `fastify`, `pg`, `@supabase/*`, server code                                                 |
| `apps/dashboard/lib`                                                           | `pg` (read-only reporting credential)             | service-role keys, API write paths                                                          |
| `packages/*` generally                                                         | other `packages/*`                                | anything from `apps/*`                                                                      |

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

- Schema changes ONLY through new files in `supabase/migrations/` with
  sequential numeric prefixes. Never edit an applied migration.
- Never `DROP` columns/tables without updating [Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892) and a deprecation migration.
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
verification command output.

## Prohibited

- Introducing Redis/Kubernetes/microservices/GraphQL/message brokers/IAP/ads.
- Any cloud analytics account requirement for local development.
- Committing credentials (`.env*` except `.example`).
- Bypassing or weakening RLS policies to make a test pass.
- Editing pinned versions of combat rules without a new `rulesVersion` and an update in [Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892).

## Expo App Client (`apps/game`) — agent tooling

The game client is Expo (SDK 52, web export now; native later). For Expo/EAS/RN
work, also read `apps/game/AGENTS.md` and https://docs.expo.dev/agents.md.

Committed agent config:

- `apps/game/AGENTS.md` — Expo SDK docs pointers and game-client rules
- `CLAUDE.md` — imports this file for Claude Code (`@AGENTS.md`)
- `.claude/settings.json` — enables `expo@claude-plugins-official`
- `.cursor/mcp.json` — Expo MCP at `https://mcp.expo.dev/mcp`

If Expo is already configured in Cursor (MCP/Skills), no per-machine redo is
needed. Optional on _other_ machines only: Expo MCP OAuth when prompted, and
`pnpm dlx skills add expo/skills`. Local MCP automation (`expo-mcp`) needs
SDK 54+ — skip until the client is upgraded.
