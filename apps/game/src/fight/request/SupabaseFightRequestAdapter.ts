import type { SupabasePublicConfig } from '../../garage/auth/supabasePublicConfig';
import { isValidIdempotencyKey } from './idempotency';
import type { FightRequestPort } from './FightRequestPort';
import { parseCombatError, parseCombatSuccess } from './parseCombatResponse';
import type { FightRequestInput, FightRequestResult } from './types';

/**
 * POST /functions/v1/combat-v1 with user JWT + Idempotency-Key.
 * Double-tap / retry MUST reuse the same key (F3) — caller owns key lifetime.
 */
export class SupabaseFightRequestAdapter implements FightRequestPort {
  readonly kind = 'supabase' as const;

  constructor(private readonly config: SupabasePublicConfig) {}

  async requestFight(input: FightRequestInput): Promise<FightRequestResult> {
    if (!input.accessToken) {
      return { ok: false, code: 'unauthenticated', message: 'Missing access token' };
    }
    if (!input.opponentId.trim()) {
      return { ok: false, code: 'invalid_body', message: 'opponentId required' };
    }
    if (!isValidIdempotencyKey(input.idempotencyKey)) {
      return {
        ok: false,
        code: 'invalid_idempotency_key',
        message: 'Idempotency-Key must be 8..128 chars',
      };
    }

    try {
      const res = await fetch(`${this.config.url}/functions/v1/combat-v1`, {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({ opponentId: input.opponentId.trim() }),
      });

      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return parseCombatError(res.status, {
          error: typeof raw.error === 'string' ? raw.error : undefined,
          message: typeof raw.message === 'string' ? raw.message : undefined,
          code: typeof raw.code === 'string' ? raw.code : undefined,
          ...(typeof raw.allowancesRemaining === 'number'
            ? { allowancesRemaining: raw.allowancesRemaining }
            : {}),
        } as { error?: string; message?: string; code?: string; allowancesRemaining?: number });
      }

      const fight = parseCombatSuccess(raw, {
        opponentId: input.opponentId.trim(),
        idempotencyKey: input.idempotencyKey,
      });
      if (!fight) {
        return {
          ok: false,
          code: 'invalid_response',
          message: 'combat-v1 returned an unexpected payload',
          httpStatus: res.status,
        };
      }
      return { ok: true, fight };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
