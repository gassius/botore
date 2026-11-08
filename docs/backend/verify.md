# Backend verification runbook

How to confirm the local Supabase backend is healthy for bots-as-data (F1),
Edge combat-v1 compute (F2), atomic fight persist (F3), pg_cron outbox /
allowance refresh (F4), and the B1 health/smoke/coverage gates. Prefer
**local** Supabase for day-to-day work. Hosted project
(`yrrytppmkykzhwelqmcs`) is optional for integration when healthy; it can
auto-pause after idle time.

## Prerequisites

- Docker-compatible runtime
- Node 24 + pnpm 11 (`corepack enable`)
- `psql` on `PATH` (for DB tests and smoke)

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
at least four current loadouts, fight readiness (`ready_as_opponent` ≥ 3),
and `storage.atlas_bucket: true`.

Edge Function (optional local serve):

```bash
pnpm exec supabase functions serve
curl -s http://127.0.0.1:54321/functions/v1/health
```

The health function returns the same `backend_health_snapshot()` payload plus
`service: "health"`. Expect `pg_cron.present: true` with
`outbox_drain_scheduled` and `allowance_refresh_scheduled` after F4.

## Fight context (F2)

```bash
psql "$DATABASE_URL" -c \
  "select public.prepare_fight_context(
     '00000000-0000-4000-8000-000000000001',
     'opp-sir-bot'
   );"
```

Expect `ok: true`, attacker `player-hero`, defender `opp-sir-bot`, weapons
from confirmed loadouts, and `allowancesRemaining` in 1..3. This RPC does
**not** consume an allowance — `persist_fight_result` owns atomic consume.

## Fight persist (F3)

```bash
psql "$DATABASE_URL" -c "select public.backend_health_snapshot()->'checks'->'fight';"
# expect persistence = persist_fight_result
```

`persist_fight_result(...)` is the single atomic write path. Smoke covers
happy persist + idempotent retry (no double allowance / XP). Defender never
receives progression ledger rows.

Combat Edge Function (after `supabase functions serve`):

```bash
# Mint a local JWT for the seed user, or sign in via Auth, then:
curl -s -X POST http://127.0.0.1:54321/functions/v1/combat-v1 \
  -H "Authorization: Bearer <access_token>" \
  -H "apikey: <anon_key>" \
  -H "Idempotency-Key: smoke-key-0001" \
  -H "Content-Type: application/json" \
  -d '{"opponentId":"opp-sir-bot"}'
```

Expect `status: "completed"`, `xpAwarded` 1|2, full semantic `replay.events`,
server CSPRNG `seed`, and `persistence: "persisted"` (or `"repeated"` on
retry with the same Idempotency-Key).

## Outbox + scheduled jobs (F4)

```bash
psql "$DATABASE_URL" -c "select * from cron.job where jobname like 'botore-%';"
psql "$DATABASE_URL" -c "select public.outbox_status_snapshot();"
# Manual drain (also runs every minute via pg_cron):
psql "$DATABASE_URL" -c \
  "select public.process_analytics_outbox(50, 5)
     from (select set_config('request.jwt.claim.role','service_role',true)) s;"
# Idempotent allowance horizon (also daily 00:05 UTC via pg_cron):
psql "$DATABASE_URL" -c \
  "select public.ensure_fight_allowances(1)
     from (select set_config('request.jwt.claim.role','service_role',true)) s;"
```

Failed rows stay in `analytics_outbox` with `last_error` / `dead_lettered_at`
(never deleted). Requeue with `retry_outbox_event(event_id)`.

## Smoke

```bash
node scripts/backend-smoke.mjs
# or: pnpm test:smoke
```

Asserts health snapshot, catalogue shape, inventory balances, admin reporting
views (including `admin_fight_readiness`), `prepare_fight_context`, persist
idempotency, and F4 outbox drain / cron job registration. Edge Function
checks are best-effort when the gateway serves functions.

## Edge runtime evidence

Requires [Deno](https://deno.land) on `PATH` (CI installs via `denoland/setup-deno`).

```bash
pnpm exec turbo run build --filter=@botore/rng --filter=@botore/replay --filter=@botore/combat-engine
pnpm vendor:edge-combat
pnpm test:edge-runtime          # deno test handler_test.ts — frozen golden + auth/eligibility
pnpm test:smoke-combat-assert   # failure-path smoke classifiers
```

Re-vendors pure packages into `supabase/functions/_shared/botore` and runs the
shipped Edge handler under Deno, asserting the frozen combat-v1 checksum
(`d2a7c18d…e2f`) and handler auth/eligibility failure paths.

## Coverage (backend packages)

```bash
pnpm test:coverage:backend
```

CI enforces thresholds on domain, contracts, combat-engine, replay, and rng
(see `.github/workflows/pr.yml`).

## Admin dashboard readiness (B2 later)

Read-only views prepared for a future dashboard — do not build B2 here:

| View / function              | Purpose                                        |
| ---------------------------- | ---------------------------------------------- |
| `admin_catalogue_summary`    | Part counts by slot                            |
| `admin_inventory_overview`   | Owned parts with account display names         |
| `admin_loadout_overview`     | Current confirmed loadouts per character       |
| `admin_fight_readiness`      | Fight eligibility + allowance depth            |
| `backend_health_snapshot()`  | Aggregated health for ops / smoke / UI         |
| `prepare_fight_context()`    | Eligibility + immutable fighter snapshots (F2) |
| `persist_fight_result()`     | Atomic fight persist + idempotency (F3)        |
| `admin_recent_battles`       | Recent persisted fights + outbox pending       |
| `admin_outbox_overview`      | Outbox pending / failing / dead-lettered depth |
| `admin_outbox_failures`      | Visible failed outbox rows                     |
| `admin_list_cron_jobs()`     | Scheduled botore pg_cron jobs                  |
| `outbox_status_snapshot()`   | Aggregated outbox + cron status                |
| `process_analytics_outbox()` | Idempotent outbox drain (service_role / cron)  |
| `ensure_fight_allowances()`  | Idempotent allowance horizon refresh           |
| `retry_outbox_event()`       | Requeue a dead-lettered / failed row           |
| `current_bot_loadouts`       | Latest immutable loadout per character         |
| `inventory_balances`         | Reconstructable ownership quantities           |

## Full quality gate

```bash
pnpm verify          # format/lint/typecheck/unit (no DB)
pnpm db:reset        # migrations + DB tests
node scripts/backend-smoke.mjs
pnpm test:edge-runtime
```
