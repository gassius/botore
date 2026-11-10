import {
  PLAYABLE_MISCONFIGURED_CODE,
  PLAYABLE_MISCONFIGURED_DETAIL,
} from '../../runtime/devScaffoldPolicy';
import type { FightRequestPort } from './FightRequestPort';
import type { FightRequestInput, FightRequestResult } from './types';

/** Fail-closed fight request — never returns a DEV golden scaffold. */
export class UnavailableFightRequestAdapter implements FightRequestPort {
  readonly kind = 'unavailable' as const;

  async requestFight(_input: FightRequestInput): Promise<FightRequestResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }
}
