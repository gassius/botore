import { DevFightBackendState, getSharedDevFightBackend } from '../dev/DevFightBackendState';
import { isValidIdempotencyKey } from './idempotency';
import type { FightRequestPort } from './FightRequestPort';
import type { FightRequestInput, FightRequestResult, FightSuccess } from './types';

/**
 * DEV combat-v1 stand-in with in-memory F3 idempotency.
 * Same key → same battle, no second allowance consume.
 * Allowance depth is shared via DevFightBackendState.
 */
export class DevFightRequestAdapter implements FightRequestPort {
  readonly kind = 'dev' as const;
  forceNetworkError = false;
  forceAllowanceExhausted = false;
  /** Optional latency for delayed-response lifecycle tests. */
  delayMs = 0;

  constructor(readonly backend: DevFightBackendState = getSharedDevFightBackend()) {}

  get allowancesRemaining(): number {
    return this.backend.allowancesRemaining;
  }

  set allowancesRemaining(value: number) {
    this.backend.allowancesRemaining = value;
  }

  async requestFight(input: FightRequestInput): Promise<FightRequestResult> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), this.delayMs);
      });
    }
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return {
        ok: false,
        code: 'invalid_idempotency_key',
        message: 'Idempotency-Key must be 8..128 chars',
      };
    }
    if (this.forceNetworkError) {
      return { ok: false, code: 'network_error', message: 'DEV network failure (fight request)' };
    }

    const prior = this.backend.fightsByKey.get(input.idempotencyKey);
    if (prior) {
      return {
        ok: true,
        fight: {
          ...prior,
          repeated: true,
          persistence: 'repeated',
          allowancesRemaining: this.backend.allowancesRemaining,
        },
      };
    }

    if (this.forceAllowanceExhausted || this.backend.allowancesRemaining < 1) {
      return {
        ok: false,
        code: 'allowance_exhausted',
        message: 'daily fight allowance exhausted',
        // Match Edge shape: code is authoritative; numeric may be omitted by callers.
        httpStatus: 409,
      };
    }

    this.backend.allowancesRemaining -= 1;
    const utcDay = this.backend.utcDay();
    const battleId = `dev-battle-${input.idempotencyKey.slice(-12)}`;
    const fight: FightSuccess = {
      battleId,
      status: 'completed',
      rulesVersion: 'combat-v1',
      seed: '0'.repeat(64),
      outcome: {
        winner: 'player-hero',
        reason: 'defeat',
      },
      replay: {
        battleId,
        rulesVersion: 'combat-v1',
        outcome: { winner: 'player-hero', reason: 'defeat' },
        events: [],
        note: 'DEV scaffold replay — not a live combat-v1 golden',
      },
      replayChecksum: 'dev-checksum',
      // xpAwarded comes from this adapter's simulated backend only — UI must not invent REF samples.
      xpAwarded: 0,
      allowancesRemaining: this.backend.allowancesRemaining,
      utcDay,
      repeated: false,
      persistence: 'persisted',
      loadoutVersionIds: { attacker: 'dev-attacker', defender: 'dev-defender' },
      atlasVersions: { attacker: 'v1', defender: 'v1' },
      opponentId: input.opponentId,
      idempotencyKey: input.idempotencyKey,
    };
    this.backend.fightsByKey.set(input.idempotencyKey, fight);
    return { ok: true, fight };
  }
}
