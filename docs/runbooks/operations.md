# Runbook: local environment reset

Symptom: local stack broken/migrated into a bad state.

1. `pnpm env:up` — ensure Supabase is running (`supabase status`).
2. `pnpm db:reset` — drops + re-applies every migration + seed, then runs
   `supabase/tests/run.sql`.
3. Re-run integration path: `pnpm --filter @botore/api test:integration`
   with `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
4. If Docker images are wedged: `pnpm env:down && docker volume ls | grep
   supabase`, remove only volumes prefixed with the botore project id, then
   `pnpm env:up` again (re-pulls ~5 min).

# Runbook: migration failure

Symptom: `supabase db reset` or a new migration fails mid-apply.

1. Read the failing statement + error in the reset output.
2. NEVER edit an already-applied migration. If your NEW migration failed:
   fix it in place (it hasn't shipped) and re-run `pnpm db:reset`.
3. If a merged migration must change: add a new corrective migration; record
   why in the ADR or commit message.
4. Data loss check: does the fix require dropping columns? Follow
   AGENTS.md — ADR + deprecation migration first.

# Runbook: replay mismatch

Symptom: dashboard shows checksum INVALID, or client render diverges.

1. Fetch the row:
   `psql $DATABASE_URL -c "select payload->>'checksum' as stored,
   battle_id from battle_replays where battle_id = '<id>'"`.
2. Recompute locally: load payload JSON, strip nothing, run
   `verifyReplay(payload)` from `@botore/replay` in a node script.
3. Classify:
   - Stored checksum ≠ recomputed over stored payload → row tampered/corrupt.
     Escalate: possible incident; snapshot the row before any write.
   - Checksum valid but events violate combat-v1 expectations → engine bug;
     freeze the seed + inputs, open an issue with both hashes.
   - Client renders differently but replay verifies → renderer bug in the
     Cocos adapter; compare PlaybackController step list vs scene timeline.
4. Never hand-edit replay rows. Corrections go through a new battle.

# Runbook: backup / restore drill

Local (monthly):
1. `pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump`
2. Restore to a scratch database:
   `createdb botore_restore && pg_restore -d botore_restore backup-*.dump`.
3. Spot-check: counts of battles/replays match source; verify three replays
   with `verifyReplay`.
4. Record duration + size in the ops log.

Production posture (future): managed Supabase PITR OR self-hosted WAL
archiving per ADR-0007; document restore RTO/RPO before live launch
(Phase 3 gate).
