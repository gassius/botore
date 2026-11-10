/**
 * Server-side data access for the dashboard (B3).
 *
 * SECURITY MODEL:
 * - All DB access happens in server components/route handlers only.
 * - Uses the read-only reporting credential (DASHBOARD_DATABASE_URL).
 * - Service-role credentials are NEVER imported here or exposed to the browser.
 * - Admin RPCs/views are service_role-granted; the local reporting URL is the
 *   postgres owner / DASHBOARD_DATABASE_URL (bypasses RLS), never a browser JWT.
 * - Auth is a development-only shared-secret cookie that FAILS CLOSED
 *   outside BOTORE_ENV=development.
 *
 * Contracts: docs/backend/admin-dashboard.md
 *   - admin_dashboard_snapshot() for ops panes
 *   - Edge GET /functions/v1/health (preferred) or snapshot.health
 *     (backend_health_snapshot) — never leftover Fastify api/worker health URLs
 */
import { Pool } from 'pg';

const globalForPool = globalThis as unknown as { pool?: Pool };

function pool(): Pool {
  const url = process.env['DASHBOARD_DATABASE_URL'];
  if (!url) throw new Error('DASHBOARD_DATABASE_URL is not set');
  globalForPool.pool ??= new Pool({ connectionString: url, max: 3 });
  return globalForPool.pool;
}

/** SQL `backend_health_snapshot` / Edge `/functions/v1/health` envelope. */
export interface BackendHealth {
  status: 'ok' | 'degraded' | 'error' | string;
  service?: string;
  checks?: Record<string, unknown>;
  checked_at?: string;
  [key: string]: unknown;
}

export interface FightStats {
  total_battles?: number;
  battles_today?: number;
  initiator_win_rate?: number | null;
  allowance_utilization_today?: number | null;
  replay_completion_rate?: number | null;
  replay_count?: number;
  player_count?: number;
  player_bot_count?: number;
  opponent_bot_count?: number;
  [key: string]: unknown;
}

export interface DailyActiveAccount {
  utc_day: string;
  accounts: number;
}

export interface RecentBattle {
  battle_id: string;
  ended_at: string | null;
  winner_id: string | null;
  end_reason: string | null;
  replay_checksum: string | null;
  attacker_atlas_version?: string | null;
  outbox_pending?: boolean | null;
  [key: string]: unknown;
}

export interface OutboxSnapshot {
  status?: string;
  pending?: number;
  failing?: number;
  dead_lettered?: number;
  [key: string]: unknown;
}

export interface AtlasVersionRow {
  version?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CronJobRow {
  jobname?: string;
  schedule?: string;
  active?: boolean;
  [key: string]: unknown;
}

export interface CronJobRunRow {
  jobname?: string;
  status?: string;
  start_time?: string | null;
  end_time?: string | null;
  [key: string]: unknown;
}

/** One-shot JSON from `public.admin_dashboard_snapshot()`. */
export interface AdminDashboardSnapshot {
  ok: boolean;
  service?: string;
  health: BackendHealth | null;
  outbox: OutboxSnapshot | null;
  fightStats: FightStats;
  dailyActiveAccounts: DailyActiveAccount[];
  players: Record<string, unknown>[];
  bots: Record<string, unknown>[];
  atlasVersions: AtlasVersionRow[];
  cronJobs: CronJobRow[];
  cronJobRuns: CronJobRunRow[];
  recentBattles: RecentBattle[];
  checkedAt?: string;
}

export type HealthSource = 'edge' | 'snapshot' | 'unavailable';

export interface DashboardHealth {
  source: HealthSource;
  status: string;
  service?: string;
  checks: Record<string, unknown>;
  httpStatus: number | null;
  detail?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeHealth(raw: unknown): BackendHealth | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const status = typeof rec['status'] === 'string' ? rec['status'] : 'error';
  const checks = asRecord(rec['checks']);
  const out: BackendHealth = { ...rec, status };
  if (typeof rec['service'] === 'string') out.service = rec['service'];
  if (checks) out.checks = checks;
  if (typeof rec['checked_at'] === 'string') out.checked_at = rec['checked_at'];
  return out;
}

function normalizeDaily(rows: unknown[]): DailyActiveAccount[] {
  return rows
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      const day = r['utc_day'];
      const accounts = r['accounts'];
      return {
        utc_day: typeof day === 'string' ? day : String(day ?? ''),
        accounts: typeof accounts === 'number' ? accounts : Number(accounts ?? 0),
      };
    })
    .filter((r): r is DailyActiveAccount => r !== null && r.utc_day.length > 0);
}

function normalizeRecent(rows: unknown[]): RecentBattle[] {
  return rows
    .map((row) => {
      const r = asRecord(row);
      if (!r) return null;
      const id = r['battle_id'];
      if (typeof id !== 'string') return null;
      const ended = r['ended_at'];
      return {
        ...r,
        battle_id: id,
        ended_at:
          typeof ended === 'string'
            ? ended
            : ended instanceof Date
              ? ended.toISOString()
              : ended == null
                ? null
                : String(ended),
        winner_id: typeof r['winner_id'] === 'string' ? r['winner_id'] : null,
        end_reason: typeof r['end_reason'] === 'string' ? r['end_reason'] : null,
        replay_checksum: typeof r['replay_checksum'] === 'string' ? r['replay_checksum'] : null,
      };
    })
    .filter((r): r is RecentBattle => r !== null);
}

/** Parse / coerce the jsonb returned by admin_dashboard_snapshot(). */
export function parseAdminDashboardSnapshot(raw: unknown): AdminDashboardSnapshot {
  const rec = asRecord(raw) ?? {};
  const fight = asRecord(rec['fightStats']) ?? {};
  const snap: AdminDashboardSnapshot = {
    ok: rec['ok'] === true,
    health: normalizeHealth(rec['health']),
    outbox: asRecord(rec['outbox']),
    fightStats: fight as FightStats,
    dailyActiveAccounts: normalizeDaily(asArray(rec['dailyActiveAccounts'])),
    players: asArray(rec['players']).map((r) => asRecord(r) ?? {}),
    bots: asArray(rec['bots']).map((r) => asRecord(r) ?? {}),
    atlasVersions: asArray(rec['atlasVersions']).map((r) => asRecord(r) ?? {}),
    cronJobs: asArray(rec['cronJobs']).map((r) => asRecord(r) ?? {}),
    cronJobRuns: asArray(rec['cronJobRuns']).map((r) => asRecord(r) ?? {}),
    recentBattles: normalizeRecent(asArray(rec['recentBattles'])),
  };
  if (typeof rec['service'] === 'string') snap.service = rec['service'];
  if (typeof rec['checkedAt'] === 'string') snap.checkedAt = rec['checkedAt'];
  return snap;
}

/**
 * One-shot admin poll via DASHBOARD_DATABASE_URL.
 * Prefer this over ad-hoc table SQL in dashboard pages.
 */
export async function fetchDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const res = await pool().query<{ snap: unknown }>(
    'select public.admin_dashboard_snapshot() as snap',
  );
  return parseAdminDashboardSnapshot(res.rows[0]?.snap);
}

function edgeHealthBaseUrl(): string | undefined {
  const explicit = process.env['EDGE_HEALTH_URL']?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const supabase = process.env['SUPABASE_URL']?.trim();
  if (supabase) return `${supabase.replace(/\/$/, '')}/functions/v1/health`;
  return undefined;
}

/**
 * Preferred live health: Edge `/functions/v1/health`.
 * Falls back to `snapshot.health` (`backend_health_snapshot`) when Edge is
 * unreachable. Never uses leftover Fastify api/worker health URLs.
 */
export async function fetchDashboardHealth(
  snapshotHealth: BackendHealth | null,
): Promise<DashboardHealth> {
  const url = edgeHealthBaseUrl();
  if (url) {
    try {
      const anon = process.env['SUPABASE_ANON_KEY']?.trim();
      const res = await fetch(url, {
        headers: {
          ...(anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : { apikey: 'dashboard' }),
        },
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      });
      const body: unknown = await res.json().catch(() => null);
      const health = normalizeHealth(body);
      if (health) {
        return {
          source: 'edge',
          status: health.status,
          service: health.service ?? 'health',
          checks: health.checks ?? {},
          httpStatus: res.status,
        };
      }
      return {
        source: 'edge',
        status: res.ok ? 'ok' : 'error',
        service: 'health',
        checks: {},
        httpStatus: res.status,
        detail: 'unparseable_edge_body',
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (snapshotHealth) {
        const fallback: DashboardHealth = {
          source: 'snapshot',
          status: snapshotHealth.status,
          checks: snapshotHealth.checks ?? {},
          httpStatus: null,
          detail: `edge_unreachable:${detail}`,
        };
        if (snapshotHealth.service) fallback.service = snapshotHealth.service;
        return fallback;
      }
      return {
        source: 'unavailable',
        status: 'error',
        checks: {},
        httpStatus: null,
        detail: `edge_unreachable:${detail}`,
      };
    }
  }

  if (snapshotHealth) {
    const fromSnap: DashboardHealth = {
      source: 'snapshot',
      status: snapshotHealth.status,
      checks: snapshotHealth.checks ?? {},
      httpStatus: null,
    };
    if (snapshotHealth.service) fromSnap.service = snapshotHealth.service;
    return fromSnap;
  }

  return {
    source: 'unavailable',
    status: 'error',
    checks: {},
    httpStatus: null,
    detail: 'no_edge_url_and_no_snapshot_health',
  };
}

export function checksumStatus(checksum: string | null): 'missing' | 'ok' | 'INVALID' {
  if (checksum === null) return 'missing';
  return /^[0-9a-f]{64}$/.test(checksum) ? 'ok' : 'INVALID';
}

export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) return '—';
  return `${Math.round(Number(rate) * 100)}%`;
}
