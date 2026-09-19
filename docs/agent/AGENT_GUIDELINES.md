# AGENTS.md — botore

Instructions for AI coding agents (and humans) working in this repository.
The equivalent content also lives at `docs/agent/AGENT_GUIDELINES.md` (this
root copy is the canonical entry point requested by the bootstrap task).

## Package boundaries (CI-enforced)

| Path                                                                           | May import                                        | Must never import                                                                           |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/rng`, `packages/replay`, `packages/domain`, `packages/combat-engine` | each other (`@botore/*`), `@noble/hashes`         | `fastify`, `pg`, `@supabase/*`, `next`, `react`, `node:*`, `cc`, anything with side effects |
| `apps/game/src`                                                                | `@botore/replay`, `react`, `react-native`, `expo` | `fastify`, `pg`, `@supabase/*`, server code                                                 |
| `apps/dashboard/lib`                                                           | `pg` (read-only reporting credential)             | service-role keys, API write paths                                                          |
| `packages/*` generally                                                         | other `packages/*`                                | anything from `apps/*`                                                                      |

Pure packages must not call `Math.random()`, `Date.now()`, or `new Date()`.
The only CSPRNG boundary is `apps/api/src/seeds.ts`.

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
- Never `DROP` columns/tables without an ADR and a deprecation migration.
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
- Editing pinned versions of combat rules without a new `rulesVersion` + ADR.

## Expo App Client (`apps/game`) — agent tooling

The game client is Expo (SDK 52, web export now; native later). For Expo/EAS/RN
work, also read `apps/game/AGENTS.md` and https://docs.expo.dev/agents.md.

Committed agent config:

- `apps/game/AGENTS.md` — Expo SDK docs pointers and game-client rules
- `CLAUDE.md` — imports this file for Claude Code (`@AGENTS.md`)
- `.claude/settings.json` — enables `expo@claude-plugins-official`
- `.cursor/mcp.json` — Expo MCP at `https://mcp.expo.dev/mcp` (OAuth in Cursor)

Per-machine (not committed): `pnpm dlx skills add expo/skills`. Local MCP
automation (`expo-mcp`) needs SDK 54+ — skip until the client is upgraded.
