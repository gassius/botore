import type { AuthPort, AuthResult, AuthSession, AuthSignInInput } from './AuthPort';

const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

/**
 * DEV auth scaffolding when EXPO_PUBLIC_SUPABASE_* is unset.
 * Issues a local session only — not a real JWT for PostgREST.
 */
export class DevAuthAdapter implements AuthPort {
  readonly kind = 'dev' as const;
  private session: AuthSession | null = null;

  async getSession(): Promise<AuthSession | null> {
    return this.session;
  }

  async signInWithPassword(input: AuthSignInInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@') || input.password.length < 1) {
      return {
        ok: false,
        code: 'invalid_credentials',
        message: 'Enter an email and password to continue (DEV scaffold).',
      };
    }
    this.session = {
      accessToken: 'dev-access-token',
      refreshToken: null,
      userId: DEV_USER_ID,
      email,
      expiresAt: null,
    };
    return { ok: true, session: this.session };
  }

  async signOut(): Promise<void> {
    this.session = null;
  }
}
