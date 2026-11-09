# Admin dashboard backend APIs (B2)

Read-only SQL views and RPCs for a future `apps/dashboard` UI. **This ticket
ships APIs/views only** — no Next.js pages, no Vercel UI work.

Connect with the server-side reporting credential (`DASHBOARD_DATABASE_URL`)
or `service_role`. Do not expose service-role keys to the browser. Prefer
these contracts over ad-hoc table SQL in dashboard code.

`admin_dashboard_snapshot()` and `admin_list_cron_job_runs()` are
`SECURITY DEFINER` and **execute is granted only to `service_role`** (not
`anon` / `authenticated`). Client JWT callers must be denied.

## One-shot poll

```sql
-- service_role / reporting credential only
select public.admin_dashboard_snapshot();
```

Returns JSON with:

| Key                   | Source                                      |
| --------------------- | ------------------------------------------- |
| `health`              | `backend_health_snapshot()` (B1)            |
| `outbox`              | `outbox_status_snapshot()` (F4)             |
| `fightStats`          | `admin_fight_stats`                         |
| `dailyActiveAccounts` | `admin_daily_active_accounts` (30 UTC days) |
| `players`             | `admin_players_overview`                    |
| `bots`                | `admin_bots_overview`                       |
| `atlasVersions`       | `admin_atlas_overview` (F5 pack versions)   |
| `cronJobs`            | `admin_list_cron_jobs()`                    |
| `cronJobRuns`         | `admin_list_cron_job_runs(20)`              |
| `recentBattles`       | `admin_recent_battles` (limit 25)           |

HTTP health remains `GET /functions/v1/health` (same shape as `health` above
plus `service: "health"`).

## Domain views / RPCs

### Backend health (B1)

| Object                      | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `backend_health_snapshot()` | Aggregated DB / outbox / cron / atlas health |
| Edge `health`               | HTTP wrapper around the snapshot             |

### Fights, players, bots

| Object                        | Purpose                                               |
| ----------------------------- | ----------------------------------------------------- |
| `admin_players_overview`      | Accounts, character, allowances, fight/XP totals      |
| `admin_bots_overview`         | Player + opponent bots with build, loadout, readiness |
| `admin_fight_stats`           | Single-row aggregates (battles, win rate, allowances) |
| `admin_daily_active_accounts` | Distinct initiators per UTC day (last 30)             |
| `admin_recent_battles`        | Persisted fights + atlas pins + outbox pending        |
| `admin_fight_readiness`       | Eligibility + allowance depth                         |
| `admin_loadout_overview`      | Confirmed loadouts                                    |
| `admin_catalogue_summary`     | Part counts by slot                                   |
| `admin_inventory_overview`    | Owned parts                                           |

### pg_cron + outbox

| Object                        | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `admin_outbox_overview`       | Pending / failing / dead-lettered depth  |
| `admin_outbox_failures`       | Visible failed outbox rows               |
| `outbox_status_snapshot()`    | Outbox + cron job list                   |
| `admin_list_cron_jobs()`      | Scheduled `botore-%` jobs                |
| `admin_list_cron_job_runs(n)` | Recent cron runs (**service_role only**) |

### Pack / atlas versions (F5)

| Object                 | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `admin_atlas_overview` | Version, status, entry counts, storage objects |

## Smoke checks

```bash
# Snapshot / cron runs: reporting DB role or service_role (not anon JWT)
psql "$DATABASE_URL" -c "select public.admin_dashboard_snapshot()->'ok';"
psql "$DATABASE_URL" -c "select * from public.admin_list_cron_job_runs(10);"
psql "$DATABASE_URL" -c "select * from public.admin_fight_stats;"
psql "$DATABASE_URL" -c "select * from public.admin_players_overview;"
psql "$DATABASE_URL" -c "select version, status from public.admin_atlas_overview;"
```

Covered by `supabase/tests/run.sql` (`TEST-OK B2 admin dashboard APIs`) and
`node scripts/backend-smoke.mjs`.
