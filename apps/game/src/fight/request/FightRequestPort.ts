import type { FightRequestInput, FightRequestResult } from './types';

/** Calls F2 combat-v1 Edge Function with F3 Idempotency-Key semantics. */
export interface FightRequestPort {
  readonly kind: 'dev' | 'supabase';
  requestFight(input: FightRequestInput): Promise<FightRequestResult>;
}
