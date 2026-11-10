import {
  PLAYABLE_MISCONFIGURED_CODE,
  PLAYABLE_MISCONFIGURED_DETAIL,
} from '../../runtime/devScaffoldPolicy';
import type { OpponentCandidatesPort } from './OpponentCandidatesPort';
import type { ListCandidatesResult, PrepareEligibilityResult } from './types';

/** Fail-closed opponents — no DEV roster when playable builds lack Supabase. */
export class UnavailableOpponentCandidatesAdapter implements OpponentCandidatesPort {
  readonly kind = 'unavailable' as const;

  async listCandidates(_input: {
    accessToken: string;
    accountId: string;
  }): Promise<ListCandidatesResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async prepareEligibility(_input: {
    accessToken: string;
    accountId: string;
    opponentId: string;
  }): Promise<PrepareEligibilityResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }
}
