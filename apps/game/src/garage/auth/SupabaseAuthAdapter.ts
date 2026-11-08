import type { AuthPort, AuthResult, AuthSession, AuthSignInInput } from './AuthPort';
import type { SupabasePublicConfig } from './supabasePublicConfig';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id?: string; email?: string };
  error?: string;
  error_description?: string;
  msg?: string;
};

/**
 * Supabase Auth via public HTTP (no @supabase/supabase-js — package boundary).
 * Uses anon key + user JWT only.
 */
export class SupabaseAuthAdapter implements AuthPort {
  readonly kind = 'supabase' as const;
  private session: AuthSession | null = null;

  constructor(private readonly config: SupabasePublicConfig) {}

  async getSession(): Promise<AuthSession | null> {
    return this.session;
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
      this.session = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? null,
        userId: body.user.id,
        email: body.user.email ?? input.email.trim(),
        expiresAt: body.expires_at ?? null,
      };
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
}
