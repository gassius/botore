/** Authenticated session for garage entry. No service-role credentials. */
export type AuthSession = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly userId: string;
  readonly email: string | null;
  readonly expiresAt: number | null;
};

export type AuthSignInInput = {
  readonly email: string;
  readonly password: string;
};

export type AuthResult =
  | { readonly ok: true; readonly session: AuthSession }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Auth boundary for the game client.
 * Live adapter talks to Supabase Auth HTTP APIs with the public anon key only.
 */
export interface AuthPort {
  readonly kind: 'dev' | 'supabase' | 'unavailable';
  getSession(): Promise<AuthSession | null>;
  signInWithPassword(input: AuthSignInInput): Promise<AuthResult>;
  signOut(): Promise<void>;
}
