import type { FightSuccess } from '../request/types';

/**
 * Shared in-memory DEV backend for roster allowance + fight persistence.
 * Both candidate and fight adapters must read/write the same instance so
 * Back→refresh does not resurrect spent slots.
 */
export class DevFightBackendState {
  allowancesRemaining: number;
  readonly fightsByKey = new Map<string, FightSuccess>();

  constructor(allowancesRemaining = 3) {
    this.allowancesRemaining = allowancesRemaining;
  }

  utcDay(): string {
    return new Date().toISOString().slice(0, 10);
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
