import type { FightQuotaSummary } from '../quota/fightQuotaTypes';
import type { FightSuccess } from '../request/types';

/**
 * Shared in-memory DEV backend for roster allowance + fight persistence.
 * Both candidate and fight adapters must read/write the same instance so
 * Back→refresh does not resurrect spent slots.
 *
 * E3: exposes a full FightQuotaSummary so UI never hard-codes limit/reset.
 */
export class DevFightBackendState {
  allowancesRemaining: number;
  limit: number;
  scope: FightQuotaSummary['scope'];
  refillPolicy: FightQuotaSummary['refillPolicy'];
  /** Override next refill; when null, derive next UTC midnight. */
  nextRefillAtOverride: string | null;
  readonly fightsByKey = new Map<string, FightSuccess>();

  constructor(allowancesRemaining = 3, limit = 3) {
    this.allowancesRemaining = allowancesRemaining;
    this.limit = limit;
    this.scope = 'player';
    this.refillPolicy = 'daily_utc_midnight';
    this.nextRefillAtOverride = null;
  }

  utcDay(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Next UTC midnight as ISO Z, or an explicit override (rolling fixtures). */
  nextRefillAt(): string {
    if (this.nextRefillAtOverride) return this.nextRefillAtOverride;
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
    );
    return next.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  quota(): FightQuotaSummary {
    const remaining = Math.max(0, this.allowancesRemaining);
    return {
      fightsRemaining: remaining,
      limit: this.limit,
      scope: this.scope,
      refillPolicy: this.refillPolicy,
      nextRefillAt: this.nextRefillAt(),
      utcDay: this.utcDay(),
      allowancesRemaining: remaining,
    };
  }
}

/** Process-wide DEV singleton used when Expo public Supabase env is unset. */
let sharedDevBackend: DevFightBackendState | null = null;

export function getSharedDevFightBackend(): DevFightBackendState {
  if (!sharedDevBackend) sharedDevBackend = new DevFightBackendState();
  return sharedDevBackend;
}

/** Test helper — reset between suites. */
export function resetSharedDevFightBackend(allowancesRemaining = 3): DevFightBackendState {
  sharedDevBackend = new DevFightBackendState(allowancesRemaining);
  return sharedDevBackend;
}
