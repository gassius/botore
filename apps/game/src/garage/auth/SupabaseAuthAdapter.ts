import type { AuthPort, AuthResult, AuthSession, AuthSignInInput } from './AuthPort';
import type { SupabasePublicConfig } from './supabasePublicConfig';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { id?: string; email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
};

/**
 * Supabase Auth via public HTTP (no @supabase/supabase-js — package boundary).
 * Uses anon key + user JWT only. Refreshes or clears expired sessions.
 */
export class SupabaseAuthAdapter implements AuthPort {
  readonly kind = 'supabase' as const;
  private session: AuthSession | null = null;
  /** Injectable clock for expiry tests (seconds since epoch). */
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000);

  constructor(private readonly config: SupabasePublicConfig) {}

  async getSession(): Promise<AuthSession | null> {
    if (!this.session) return null;
    if (this.session.expiresAt === null) return this.session;
    // Refresh a minute early to avoid edge races with server clocks.
    if (this.session.expiresAt > this.nowSeconds() + 60) return this.session;
    return this.refreshSession();
  }

  async signInWithPassword(input: AuthSignInInput): Promise<AuthResult> {
    try {
      const res = await fetch(`${this.config.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email.trim(),
          password: input.password,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as TokenResponse;
      if (!res.ok || !body.access_token || !body.user?.id) {
        return {
          ok: false,
          code: body.error ?? `http_${res.status}`,
          message:
            body.error_description ?? body.msg ?? body.error ?? `Sign-in failed (${res.status})`,
        };
      }
      this.session = this.toSession(body, input.email.trim());
      return { ok: true, session: this.session };
    } catch (err) {
      return {
        ok: false,
        code: 'network_error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async signOut(): Promise<void> {
    const token = this.session?.accessToken;
    this.session = null;
    if (!token) return;
    try {
      await fetch(`${this.config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Local sign-out already cleared; network logout is best-effort.
    }
  }

  /** Test helper: seed a cached session without going through sign-in. */
  setSessionForTests(session: AuthSession | null): void {
    this.session = session;
  }

  private async refreshSession(): Promise<AuthSession | null> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) {
      this.session = null;
      return null;
    }
    try {
      const res = await fetch(`${this.config.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const body = (await res.json().catch(() => ({}))) as TokenResponse;
      if (!res.ok || !body.access_token || !body.user?.id) {
        this.session = null;
        return null;
      }
      this.session = this.toSession(body, this.session?.email ?? body.user.email ?? null);
      return this.session;
    } catch {
      this.session = null;
      return null;
    }
  }

  private toSession(body: TokenResponse, email: string | null): AuthSession {
    const expiresAt =
      body.expires_at ??
      (typeof body.expires_in === 'number' ? this.nowSeconds() + body.expires_in : null);
    return {
      accessToken: body.access_token!,
      refreshToken: body.refresh_token ?? null,
      userId: body.user!.id!,
      email: body.user?.email ?? email,
      expiresAt,
    };
  }
}
