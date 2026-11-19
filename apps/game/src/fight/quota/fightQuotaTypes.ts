/**
 * E3 server-driven fight quota contract (ClickUp 1amjtrezeba).
 * Values come from get_fight_allowance_summary — never hard-code limit/reset in UI.
 */

export type FightQuotaScope = 'player' | 'bot';

export type FightQuotaRefillPolicy = 'daily_utc_midnight' | 'rolling_per_fight';

/** Player-facing quota summary from the sanctioned RPC (no account ids). */
export type FightQuotaSummary = {
  readonly fightsRemaining: number;
  readonly limit: number;
  readonly scope: FightQuotaScope;
  readonly refillPolicy: FightQuotaRefillPolicy;
  /** ISO-8601 UTC instant; countdown derives only from this. */
  readonly nextRefillAt: string;
  /** Compat / day key for daily policy. */
  readonly utcDay: string;
  /** Alias of fightsRemaining for pre-E3 call sites. */
  readonly allowancesRemaining: number;
};

export function isFightQuotaScope(value: unknown): value is FightQuotaScope {
  return value === 'player' || value === 'bot';
}

export function isFightQuotaRefillPolicy(value: unknown): value is FightQuotaRefillPolicy {
  return value === 'daily_utc_midnight' || value === 'rolling_per_fight';
}

/** Parse RPC JSON into FightQuotaSummary; returns null when required fields missing. */
export function parseFightQuotaSummary(body: unknown): FightQuotaSummary | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.ok !== true) return null;

  const fightsRemaining =
    typeof b.fightsRemaining === 'number'
      ? b.fightsRemaining
      : typeof b.allowancesRemaining === 'number'
        ? b.allowancesRemaining
        : null;
  const limit = typeof b.limit === 'number' ? b.limit : null;
  const scope = isFightQuotaScope(b.scope) ? b.scope : null;
  const refillPolicy = isFightQuotaRefillPolicy(b.refillPolicy) ? b.refillPolicy : null;
  const nextRefillAt =
    typeof b.nextRefillAt === 'string' && b.nextRefillAt.length > 0 ? b.nextRefillAt : null;
  const utcDay = typeof b.utcDay === 'string' ? b.utcDay : '';

  if (
    fightsRemaining === null ||
    limit === null ||
    scope === null ||
    refillPolicy === null ||
    nextRefillAt === null
  ) {
    // Compat: pre-E3 bodies still usable for remaining/day only.
    if (typeof b.allowancesRemaining === 'number' && typeof b.utcDay === 'string') {
      const remaining = b.allowancesRemaining;
      return {
        fightsRemaining: remaining,
        limit: typeof b.limit === 'number' ? b.limit : remaining,
        scope: isFightQuotaScope(b.scope) ? b.scope : 'player',
        refillPolicy: isFightQuotaRefillPolicy(b.refillPolicy)
          ? b.refillPolicy
          : 'daily_utc_midnight',
        nextRefillAt: typeof b.nextRefillAt === 'string' ? b.nextRefillAt : '',
        utcDay: b.utcDay,
        allowancesRemaining: remaining,
      };
    }
    return null;
  }

  return {
    fightsRemaining,
    limit,
    scope,
    refillPolicy,
    nextRefillAt,
    utcDay,
    allowancesRemaining:
      typeof b.allowancesRemaining === 'number' ? b.allowancesRemaining : fightsRemaining,
  };
}

/** Format a non-negative millisecond delta as HH:MM:SS. */
export function formatRefillCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function msUntilRefill(nextRefillAt: string, nowMs: number = Date.now()): number {
  const target = Date.parse(nextRefillAt);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, target - nowMs);
}

/**
 * Design-capture only: force D8/D9 quota stills (2/3 + countdown, or exhausted).
 * Applies after any candidates adapter (DEV or live Supabase) so Android live-fight
 * CI can deep-link `fightQuota=remaining` without mutating server allowance rows.
 */
export function applyDesignCaptureFightQuotaScenario(
  scenario: 'remaining' | 'exhausted' | null | undefined,
  input: {
    readonly allowancesRemaining: number;
    readonly quota: FightQuotaSummary | null;
  },
  nowMs: number = Date.now(),
): { readonly allowancesRemaining: number; readonly quota: FightQuotaSummary | null } {
  if (scenario !== 'remaining' && scenario !== 'exhausted') return input;

  const baseLimit = Math.max(1, input.quota?.limit ?? 3);
  // D8 design still: 2 of 3 with a live countdown (not the Full chip).
  const remaining = scenario === 'exhausted' ? 0 : Math.min(2, Math.max(1, baseLimit - 1));
  const limit = scenario === 'remaining' ? Math.max(baseLimit, remaining + 1) : baseLimit;

  let nextRefillAt = input.quota?.nextRefillAt ?? '';
  if (
    !nextRefillAt ||
    !Number.isFinite(Date.parse(nextRefillAt)) ||
    Date.parse(nextRefillAt) <= nowMs
  ) {
    // Keep countdown visible for the still when the live seed is already full / due.
    nextRefillAt = new Date(nowMs + 3 * 3600 * 1000 + 12 * 60 * 1000 + 45 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
  }

  const quota: FightQuotaSummary = {
    fightsRemaining: remaining,
    limit,
    scope: input.quota?.scope ?? 'player',
    refillPolicy: input.quota?.refillPolicy ?? 'daily_utc_midnight',
    nextRefillAt,
    utcDay: input.quota?.utcDay ?? new Date(nowMs).toISOString().slice(0, 10),
    allowancesRemaining: remaining,
  };

  return { allowancesRemaining: remaining, quota };
}

/** Logcat / simctl marker for Android D8 2/3 stills — CI waits on this exact string. */
export function formatDesignCaptureQuotaLog(
  remaining: number,
  limit: number,
): `BOTORE_CAPTURE_QUOTA:remaining=${number} limit=${number}` {
  return `BOTORE_CAPTURE_QUOTA:remaining=${remaining} limit=${limit}`;
}
