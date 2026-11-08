# Backend verification runbook

How to confirm the local Supabase backend is healthy for bots-as-data (F1)
and the B1 health/smoke/coverage gates. Hosted Supabase is out of scope
while paused — use local only.

## Prerequisites

- Docker-compatible runtime
- Node 24 + pnpm 11 (`corepack enable`)
- `psql` on `PATH` (for DB tests and smoke)

Prefer **local** Supabase for day-to-day work. Hosted project may be used for
optional integration checks when healthy; it can auto-pause after idle time.

## Bring-up

```bash
pnpm install --frozen-lockfile
pnpm env:up          # supabase start
pnpm db:reset        # migrations + seed + supabase/tests/run.sql
```

Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`  
API gateway: `http://127.0.0.1:54321`

## Health snapshot

SQL (always available after `db:reset`):

```bash
psql "$DATABASE_URL" -c "select public.backend_health_snapshot();"
```

Expect `status: ok`, proof catalogue counts (1 chassis / 2 paints / 3 weapons),
at least four current loadouts, and `storage.atlas_bucket: true`.

Edge Function (optional local serve):

```bash
pnpm exec supabase functions serve health
curl -s http://127.0.0.1:54321/functions/v1/health
```

The function returns the same `backend_health_snapshot()` payload plus
`service: "health"`. `pg_cron.present` is `false` until F4 — that is expected,
not a failure by itself when the overall status is `ok`.

## Smoke

```bash
node scripts/backend-smoke.mjs
```

Asserts health snapshot, catalogue shape, inventory balances, and admin
reporting views. Edge Function check is best-effort when the gateway serves
functions.

## Coverage (domain / contracts)

```bash
pnpm --filter @botore/domain test -- --coverage
pnpm --filter @botore/contracts test -- --coverage
```

CI enforces thresholds on these packages (see `.github/workflows/pr.yml`).

## Admin dashboard readiness (B2 later)

Read-only views prepared for a future dashboard — do not build B2 here:

| View / function             | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `admin_catalogue_summary`   | Part counts by slot                      |
| `admin_inventory_overview`  | Owned parts with account display names   |
| `admin_loadout_overview`    | Current confirmed loadouts per character |
| `backend_health_snapshot()` | Aggregated health for ops / smoke / UI   |
| `current_bot_loadouts`      | Latest immutable loadout per character   |
| `inventory_balances`        | Reconstructable ownership quantities     |

## Full quality gate

```bash
pnpm verify          # format/lint/typecheck/unit (no DB)
pnpm db:reset        # migrations + DB tests
node scripts/backend-smoke.mjs
```
