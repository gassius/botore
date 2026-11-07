# botore

Setup, run, and test for this repository. Decisions live in ClickUp, not here:

- [Technical Architecture](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1892)
- [Overall Product Vision](https://app.clickup.com/90122060531/docs/2kxv30qk-1092/2kxv30qk-1852)
- [Art Direction v0.1](https://app.clickup.com/90122060531/docs/2kxv30qk-232/2kxv30qk-332)
- [Sound FX & Music Guidelines](https://app.clickup.com/90122060531/docs/2kxv30qk-1072)

Agent rules: `AGENTS.md`. Combat spec: `docs/architecture/combat-v1.md`.
Layout: `docs/architecture/overview.md`. Audio index: `docs/audio/README.md`.

## Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | 24.x (`engines`) | required |
| pnpm | 11.x (`packageManager`) | `corepack enable` |
| Docker-compatible runtime | recent | Supabase CLI only |
| Supabase CLI | pinned devDependency | `pnpm exec supabase` |

No cloud accounts for local development.

## Quick start

```bash
pnpm install --frozen-lockfile
pnpm env:up          # local Postgres/Auth/Storage
pnpm db:reset        # migrations + seed + DB tests
pnpm dev             # leftover api :8080, worker :8081, dashboard :3100
pnpm verify          # format/lint/typecheck/test (no DB)
```

Local URLs (this checkout):

- API: http://127.0.0.1:8080/health · `/ready` · `/v1/opponents`
- Worker: http://127.0.0.1:8081/health · `/drain`
- Dashboard: http://127.0.0.1:3100 (dev token from `apps/dashboard/.env.example`)
- Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

```bash
curl -s -X POST http://127.0.0.1:8080/v1/battles \
  -H 'content-type: application/json' \
  -H 'idempotency-key: my-first-battle' \
  -d '{"opponentId":"opp-sir-bot"}'
```

Replay: `GET /v1/battles/<id>/replay`.

Copy each app’s `.env.example` to `.env.local` if needed. Never commit `.env*`.

Game client: `pnpm --filter @botore/game start` (Expo). Headless:
`pnpm --filter @botore/game test`. See `apps/game/AGENTS.md`.

## Test

- `pnpm test` — unit/property/golden
- `pnpm test:integration` — needs `DATABASE_URL` after `env:up` + `db:reset`
- `pnpm env:down` — stop local Supabase

`supabase start` first run pulls images (~2 GB). Ports: 54321–54323, 8080,
8081, 3100. Dashboard 403 unless `BOTORE_ENV=development`.
