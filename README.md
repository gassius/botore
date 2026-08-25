# botore

TypeScript-first asynchronous auto-battler platform. Deterministic
server-authoritative combat, replay-centric rendering, reproducible local
stack. See `game-architecture-report.md` for the founding analysis and
`docs/architecture/overview.md` for the current system shape.

## Prerequisites

| Tool                      | Version                                        | Notes                                                           |
| ------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Node.js                   | 24.x (pinned via `engines`)                    | required                                                        |
| pnpm                      | 11.x (`corepack enable` uses `packageManager`) | required                                                        |
| Docker-compatible runtime | any recent                                     | needed by Supabase CLI only                                     |
| Supabase CLI              | pinned devDependency (`pnpm exec supabase`)    | auto-installed by pnpm                                          |
| Cocos Creator             | 3.8.x                                          | optional until native/web builds; see apps/game/README-COCOS.md |

No cloud accounts are required for local development.

## Quick start (clean clone)

```bash
pnpm install --frozen-lockfile

# 1) local stack: Postgres/Auth/Storage via Supabase CLI in Docker
pnpm env:up

# 2) schema + seed + database tests
pnpm db:reset

# 3) run everything
pnpm dev            # api :8080, worker :8081, dashboard :3100

# 4) full quality gate (no DB needed)
pnpm verify
```

Local URLs:

- API health: http://127.0.0.1:8080/health · ready: `/ready`
- Opponents: http://127.0.0.1:8080/v1/opponents
- Worker health: http://127.0.0.1:8081/health · drain: `/drain`
- Dashboard: http://127.0.0.1:3100 (dev token from
  `apps/dashboard/.env.example`, default `local-dev-token`)
- Supabase Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

Try a fight:

```bash
curl -s -X POST http://127.0.0.1:8080/v1/battles \
  -H 'content-type: application/json' \
  -H 'idempotency-key: my-first-battle' \
  -d '{"opponentId":"opp-sir-bot"}'
```

Then fetch the replay with the returned battleId:
`GET /v1/battles/<id>/replay`.

## Environment files

Each app ships `.env.example` with safe placeholders — copy to `.env.local`
when needed. Never commit `.env*`. The API's server credential bypasses RLS
by design; clients never receive it.

## Cocos game app

`apps/game` contains the editor-ready scaffold: framework-free playback core,
BattleReplayController adapter, and verified manual steps for creating the
Creator project at the pinned release. See `apps/game/README-COCOS.md`.
Until the editor project exists, playback logic is covered headlessly
(`pnpm --filter @botore/game test`).

## Repository map

```text
apps/        api (Fastify) · worker · dashboard (Next.js) · game (Cocos scaffold)
packages/    combat-engine · domain · contracts · rng · replay ·
             analytics-events · config · test-fixtures · eslint-config · tsconfig
supabase/    migrations · tests · config.toml (local project)
infra/       env-up/down · db-reset · verify · compose.yaml
docs/        architecture (+ combat-v1, overview, diagrams) · adr · runbooks · agent
scripts/     boundary checker · secret scan · license inventory
```

## Testing

- `pnpm test` — unit/property/golden (pure packages + api/worker/game logic).
- `pnpm test:integration` — API against reset local Supabase; requires
  `DATABASE_URL` (skips automatically when unset).
- `pnpm db:reset` also executes SQL database tests (RLS denials,
  idempotency constraint, append-only ledgers).

## Troubleshooting

- **supabase start fails / pulls images slowly** — first run downloads ~2 GB;
  ensure the Docker daemon is up. Retry `pnpm env:up`.
- **Port conflicts** — 54321–54323 (Supabase), 8080/8081 (services), 3100
  (dashboard). Free them or adjust env before starting.
- **`ERR_PNPM_IGNORED_BUILDS`** — allowlist new build scripts under
  `allowBuilds` in `pnpm-workspace.yaml` (see esbuild precedent).
- **Integration tests skip** — `DATABASE_URL` unset; source
  `apps/api/.env.example` values first.
- **Dashboard 403** — dashboard requires `BOTORE_ENV=development`; it fails
  closed everywhere else.

## Teardown

```bash
pnpm env:down        # stops supabase containers
docker volume ls | grep supabase   # optional: remove volumes for full wipe
```

## License / notices

Private bootstrap. Third-party runtime dependencies are inventoried by
`scripts/license-inventory.sh`; engine licensing notes live in ADR-0001.
