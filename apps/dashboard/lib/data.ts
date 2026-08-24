/**
 * Server-side data access for the dashboard.
 *
 * SECURITY MODEL:
 * - All DB access happens in server components/route handlers only.
 * - Uses the read-only reporting credential (DASHBOARD_DATABASE_URL).
 * - Service-role credentials are NEVER imported here or exposed to the browser.
 * - Auth is a development-only shared-secret cookie that FAILS CLOSED
 *   outside BOTORE_ENV=development.
 */
import { Pool } from 'pg';

const globalForPool = globalThis as unknown as { pool?: Pool };

function pool(): Pool {
  const url = process.env['DASHBOARD_DATABASE_URL'];
  if (!url) throw new Error('DASHBOARD_DATABASE_URL is not set');
  globalForPool.pool ??= new Pool({ connectionString: url, max: 3 });
  return globalForPool.pool;
}

export interface HealthStatus {
  api: boolean;
  worker: boolean;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const check = async (url: string | undefined): Promise<boolean> => {
    if (!url) return false;
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  };
  return {
    api: await check(process.env['API_HEALTH_URL']),
    worker: await check(process.env['WORKER_HEALTH_URL']),
  };
}

export async function dailyActiveAccounts(days = 7): Promise<{ day: string; accounts: number }[]> {
  const res = await pool().query<{ utc_day: string; accounts: string }>(
    `SELECT d.utc_day, count(DISTINCT b.initiator_account_id)::text AS accounts
       FROM (SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date::text AS utc_day) d
       LEFT JOIN battles b ON b.utc_day = d.utc_day
      GROUP BY d.utc_day ORDER BY d.utc_day`,
    [days],
  );
  return res.rows.map((r) => ({ day: r.utc_day, accounts: Number.parseInt(r.accounts, 10) }));
}

export async function battleStats(): Promise<{
  totalBattles: number;
  winRate: number | null;
  allowanceUtilization: number | null;
}> {
  const battles = await pool().query<{ n: string; wins: string }>(
    `SELECT count(*)::text AS n,
            count(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id = initiator_account_character)::text AS wins
       FROM battles`,
  );
  const allowances = await pool().query<{ used: string; total: string }>(
    `SELECT count(*) FILTER (WHERE used_at IS NOT NULL)::text AS used, count(*)::text AS total FROM fight_allowances`,
  );
  const row = battles.rows[0];
  const aRow = allowances.rows[0];
  const total = Number.parseInt(row?.n ?? '0', 10);
  const wins = Number.parseInt(row?.wins ?? '0', 10);
  const used = Number.parseInt(aRow?.used ?? '0', 10);
  const allowanceTotal = Number.parseInt(aRow?.total ?? '0', 10);
  return {
    totalBattles: total,
    winRate: total > 0 ? wins / total : null,
    allowanceUtilization: allowanceTotal > 0 ? used / allowanceTotal : null,
  };
}

export async function replayCompletionRate(): Promise<number | null> {
  const res = await pool().query<{ started: string; completed: string }>(
    `SELECT
       count(DISTINCT event_id) FILTER (WHERE event_name = 'replay_started')::text AS started,
       count(DISTINCT event_id) FILTER (WHERE event_name = 'replay_completed')::text AS completed
       FROM analytics_outbox WHERE processed_at IS NOT NULL OR true`,
  );
  const row = res.rows[0];
  const started = Number.parseInt(row?.started ?? '0', 10);
  const completed = Number.parseInt(row?.completed ?? '0', 10);
  return started > 0 ? completed / started : null;
}

export interface RecentBattle {
  battleId: string;
  endedAt: string;
  winnerId: string | null;
  endReason: string;
  checksum: string | null;
  checksumOk: boolean | null;
}

export async function recentBattles(limit = 10): Promise<RecentBattle[]> {
  const res = await pool().query<{
    battle_id: string;
    ended_at: Date;
    winner_id: string | null;
    end_reason: string;
    checksum: string | null;
  }>(
    `SELECT b.battle_id, b.ended_at, b.winner_id, b.end_reason, r.checksum
       FROM battles b
       LEFT JOIN battle_replays r USING (battle_id)
      ORDER BY b.ended_at DESC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    battleId: r.battle_id,
    endedAt: r.ended_at.toISOString(),
    winnerId: r.winner_id,
    endReason: r.end_reason,
    checksum: r.checksum,
    checksumOk: r.checksum === null ? null : /^[0-9a-f]{64}$/.test(r.checksum),
  }));
}
