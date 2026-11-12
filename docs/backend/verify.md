# Backend verification runbook

How to confirm the local Supabase backend is healthy for bots-as-data (F1),
Edge combat-v1 compute (F2), atomic fight persist (F3), pg_cron outbox /
allowance refresh (F4), and the B1 health / smoke / coverage gates. Prefer
**local** Supabase for day-to-day work. Hosted project
(`yrrytppmkykzhwelqmcs`) is optional for integration when healthy; it can
auto-pause after idle time.

## Prerequisites

- Docker-compatible runtime
- Node 24 + pnpm 11 (`corepack enable`)
- Deno 2.9+ on `PATH` (Edge runtime + coverage gates; CI uses `denoland/setup-deno`)
- `psql` on `PATH` (for DB tests and smoke)

## Bring-up

```bash
pnpm install --frozen-lockfile
pnpm env:up          # supabase start
pnpm db:reset        # migrations + seed + supabase/tests/run.sql
pnpm exec supabase functions serve   # live /health + /combat-v1
```

Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`  
API gateway: `http://127.0.0.1:54321`

`pnpm db:reset` applies `supabase/seed.sql` (parts catalogue + proof characters)
and runs `scripts/seed-atlas-storage.mjs` via `infra/db-reset.sh`. Until both
land, `backend_health_snapshot` / Edge `/health` stay **not ok** (HTTP **503**
when Edge is served).

## Hosted Development bootstrap (`yrrytppmkykzhwelqmcs`)

`[db.seed]` / `supabase/seed.sql` run on **local `db reset` only** — hosted
`db push` does **not** seed the parts catalogue or proof accounts. Atlas
payloads are never fabricated by SQL. After applying migrations on
Development, Infra must run:

```bash
# 1) Migrations (no seed)
pnpm exec supabase db push --project-ref yrrytppmkykzhwelqmcs

# 2) Parts catalogue + proof characters / loadouts (same SQL as local seed)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

# 3) Upload atlas/v1 placeholders + publish (Storage API)
export SUPABASE_URL=https://yrrytppmkykzhwelqmcs.supabase.co
# SUPABASE_SERVICE_ROLE_KEY from project settings
node scripts/seed-atlas-storage.mjs
```

Health stays **503 / not ok** until steps 2–3 succeed (`parts_catalogue`
proof counts + published atlas `v1`). Details:
[`docs/architecture/atlas.md`](../architecture/atlas.md),
[`supabase/seed/atlas/README.md`](../../supabase/seed/atlas/README.md).

## Edge Function deploy (multi-file)

Deploy with the CLI so the Deno multi-file tree is preserved:

```bash
pnpm exec supabase functions deploy --project-ref yrrytppmkykzhwelqmcs --yes
```

CI: `.github/workflows/deploy-edge-functions.yml` (push to `main` under
`supabase/functions/**`, or `workflow_dispatch`). Requires repo secrets
`SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`. Do **not** use the Dashboard
“bundle with esbuild” deploy for `combat-v1` / `platform-auth` (or peers) —
that collapses relative imports. Layout gate:
`node scripts/check-edge-multifile-layout.mjs`.

## Health snapshot

SQL (always available after `db:reset`):

```bash
psql "$DATABASE_URL" -c "select public.backend_health_snapshot();"
```

Expect `status: ok`, proof catalogue counts (1 chassis / 2 paints / 3 weapons),
at least four current loadouts, fight readiness (`ready_as_opponent` ≥ 3),
`storage.atlas_bucket: true`, `pg_cron.present` with both botore jobs
scheduled, and outbox processor `process_analytics_outbox`.

Edge Function (after `functions serve`):

```bash
curl -s http://127.0.0.1:54321/functions/v1/health \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

Returns the SQL snapshot plus `service: "health"` and
`checks.edge_functions` (`health` self + live `combat-v1` probe). Expect
HTTP 200 and `status: ok` when DB/cron/storage are healthy **and** combat-v1
is mounted. Missing Edge peers yield `status: degraded` (HTTP 503).

## Platform auth (C12)

Native Game Center / Play Games → Edge `platform-auth` → session. See
`docs/backend/platform-auth.md`. No Supabase anonymous sign-in.

```bash
deno test -A --config=supabase/functions/platform-auth/deno.json \
  supabase/functions/platform-auth
```

## Account deletion (R5)

Soft-delete + anonymize + public web code. See
`docs/backend/account-deletion.md`.

```bash
deno test -A --config=supabase/functions/account-delete/deno.json \
  supabase/functions/account-delete
```

Public web path on the game export: `/account/delete`.

## Privacy disclosure (R6)

Public `/privacy` + in-app Stable → Privacy policy. Copy covers platform auth,
synthetic emails, sessions, crash reporting, and the R5 deletion URL
(`/account/delete`). See `docs/legal/privacy-policy.md`.

```bash
pnpm --filter @botore/game exec vitest run test/privacyPolicy.test.ts
```

## Sanctioned client reads (B)

```bash
psql "$DATABASE_URL" -c \
  "select public.get_owned_character()
     from (select set_config('request.jwt.claim.role','authenticated',true),
                  set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)) s;"
psql "$DATABASE_URL" -c \
  "select public.list_opponent_roster()
     from (select set_config('request.jwt.claim.role','authenticated',true),
                  set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)) s;"
psql "$DATABASE_URL" -c \
  "select public.get_fight_allowance_summary()
     from (select set_config('request.jwt.claim.role','authenticated',true),
                  set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)) s;"
```

Expect owned `player-hero` / `Hero`, three system opponents, and
`allowancesRemaining` in 0..3 for server UTC `utcDay`. Full contract:
[`docs/backend/client-read-rpcs.md`](./client-read-rpcs.md).

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
# Full gate (matches CI): Edge Functions must be served
REQUIRE_EDGE_FUNCTIONS=1 node scripts/backend-smoke.mjs
# or: REQUIRE_EDGE_FUNCTIONS=1 pnpm test:smoke
```

Asserts health snapshot (DB, Storage, pg_cron, outbox), catalogue shape,
inventory balances, admin reporting views, `prepare_fight_context`, persist
idempotency, F4 outbox drain, and live `/functions/v1/health` +
`/functions/v1/combat-v1`. Without `REQUIRE_EDGE_FUNCTIONS=1`, missing Edge
endpoints may skip; CI always requires them.

## Edge runtime evidence

```bash
pnpm exec turbo run build --filter=@botore/rng --filter=@botore/replay --filter=@botore/combat-engine
pnpm vendor:edge-combat
pnpm test:edge-runtime          # deno test combat-v1 — frozen golden + auth/eligibility
pnpm test:smoke-combat-assert   # failure-path smoke classifiers
```

Re-vendors pure packages into `supabase/functions/_shared/botore` and runs the
shipped Edge handler under Deno, asserting the frozen combat-v1 checksum
(`d2a7c18d…e2f`) and handler auth/eligibility failure paths.

## Coverage gates (B1)

Real measured coverage only — no invented percentages.

| Gate          | Command                                            | Metric                                                                              |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Pure packages | `pnpm test:coverage:backend` (Vitest portion)      | Vitest v8 thresholds in each package `vitest.config.ts`                             |
| Edge handlers | `pnpm test:coverage:edge`                          | Deno `coverage --threshold=75` on `combat-v1/handler.ts` + `health/handler.ts`      |
| DB suite      | `pnpm test:coverage:db -- --log /tmp/db-tests.log` | 100% of `TEST-OK` markers from `supabase/tests/run.sql` must appear in the psql log |

CI job **`backend coverage gate`** enforces package + Edge thresholds. The
database job enforces the SQL `TEST-OK` execution gate and runs smoke with
`REQUIRE_EDGE_FUNCTIONS=1`. Mark **`backend coverage gate`** as a required
check on `main` (branch protection).

```bash
# After db:reset / CI db step:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run.sql 2>&1 | tee /tmp/db-tests.log
pnpm test:coverage:db -- --log /tmp/db-tests.log
pnpm test:coverage:edge
```

## Admin dashboard (B2 APIs/views + B3 UI)

Backend contract for `apps/dashboard`: server components call
`admin_dashboard_snapshot()` via `DASHBOARD_DATABASE_URL` and prefer Edge
`GET /functions/v1/health` (fallback: snapshot `backend_health_snapshot`).
Full table: [`docs/backend/admin-dashboard.md`](./admin-dashboard.md).

**SEC lockdown:** `admin_*` views and
`backend_health_snapshot` / `outbox_status_snapshot` / `admin_list_cron_jobs`
are granted to **`service_role` only** (not `anon` / `authenticated`). Call
them from the reporting DB credential or Edge Functions that use the service
role key. Migration `0019_admin_grant_lockdown.sql`.

| View / function                 | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `admin_dashboard_snapshot()`    | One-shot JSON for health + fights + ops panes  |
| `admin_players_overview`        | Players, allowances, fight/XP totals           |
| `admin_bots_overview`           | Player + opponent bots (build/loadout/ready)   |
| `admin_fight_stats`             | Single-row fight/player aggregates             |
| `admin_daily_active_accounts`   | Distinct initiators per UTC day (30d)          |
| `admin_list_cron_job_runs(n)`   | Recent botore pg_cron run history              |
| `admin_atlas_overview`          | Pack / atlas versions (F5)                     |
| `admin_catalogue_summary`       | Part counts by slot                            |
| `admin_inventory_overview`      | Owned parts with account display names         |
| `admin_loadout_overview`        | Current confirmed loadouts per character       |
| `admin_fight_readiness`         | Fight eligibility + allowance depth            |
| `backend_health_snapshot()`     | Aggregated SQL health for ops / smoke / UI     |
| `GET /functions/v1/health`      | SQL snapshot + `checks.edge_functions` probes  |
| `get_owned_character()`         | Sanctioned owned character read (auth.uid())   |
| `list_opponent_roster()`        | Sanctioned system opponent roster              |
| `get_fight_allowance_summary()` | Sanctioned allowance summary (auth.uid())      |
| `prepare_fight_context()`       | Eligibility + immutable fighter snapshots (F2) |
| `persist_fight_result()`        | Atomic fight persist + idempotency (F3)        |
| `admin_recent_battles`          | Recent persisted fights + outbox pending       |
| `admin_outbox_overview`         | Outbox pending / failing / dead-lettered depth |
| `admin_outbox_failures`         | Visible failed outbox rows                     |
| `admin_list_cron_jobs()`        | Scheduled botore pg_cron jobs                  |
| `outbox_status_snapshot()`      | Aggregated outbox + cron status                |
| `process_analytics_outbox()`    | Idempotent outbox drain (service_role / cron)  |
| `ensure_fight_allowances()`     | Idempotent allowance horizon refresh           |
| `retry_outbox_event()`          | Requeue a dead-lettered / failed row           |
| `current_bot_loadouts`          | Latest immutable loadout per character         |
| `inventory_balances`            | Reconstructable ownership quantities           |

## Full quality gate

```bash
pnpm verify          # format/lint/typecheck/unit (no DB)
pnpm db:reset        # migrations + DB tests
pnpm exec supabase functions serve &
REQUIRE_EDGE_FUNCTIONS=1 node scripts/backend-smoke.mjs
pnpm test:edge-runtime
pnpm test:coverage:edge
```
