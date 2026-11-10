import {
  PLAYABLE_MISCONFIGURED_CODE,
  PLAYABLE_MISCONFIGURED_DETAIL,
} from '../../runtime/devScaffoldPolicy';
import type { AuthPort, AuthResult, AuthSession, AuthSignInInput } from './AuthPort';

/**
 * Fail-closed auth when preview/production lacks Supabase public env.
 * Never issues a DEV session.
 */
export class UnavailableAuthAdapter implements AuthPort {
  readonly kind = 'unavailable' as const;

  async getSession(): Promise<AuthSession | null> {
    return null;
  }

  async signInWithPassword(_input: AuthSignInInput): Promise<AuthResult> {
    return {
      ok: false,
      code: PLAYABLE_MISCONFIGURED_CODE,
      message: PLAYABLE_MISCONFIGURED_DETAIL,
    };
  }

  async signOut(): Promise<void> {
    /* no session */
  }
}
