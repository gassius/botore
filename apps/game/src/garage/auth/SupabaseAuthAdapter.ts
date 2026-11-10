import type { AuthPort, AuthResult, AuthSession, AuthSignInInput } from './AuthPort';
import { createMemoryAuthSessionStore, type AuthSessionStore } from './authSessionStore';
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
 * Persists sessions through {@link AuthSessionStore} for relaunch restore.
 */
export class SupabaseAuthAdapter implements AuthPort {
  readonly kind = 'supabase' as const;
  private session: AuthSession | null = null;
  private hydratedFromStore = false;
  /** Injectable clock for expiry tests (seconds since epoch). */
  nowSeconds: () => number = () => Math.floor(Date.now() / 1000);

  constructor(
    private readonly config: SupabasePublicConfig,
    private readonly store: AuthSessionStore = createMemoryAuthSessionStore(),
  ) {}

  async getSession(): Promise<AuthSession | null> {
    if (!this.hydratedFromStore) {
      this.hydratedFromStore = true;
      if (!this.session) {
        this.session = await this.store.load();
      }
    }
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
      await this.persist();
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
    await this.persist();
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

  /** Apply Edge-minted platform-auth session and persist for relaunch. */
  async applySession(session: AuthSession): Promise<void> {
    this.session = session;
    this.hydratedFromStore = true;
    await this.persist();
  }

  /** Test helper: seed a cached session without going through sign-in. */
  setSessionForTests(session: AuthSession | null): void {
    this.session = session;
    this.hydratedFromStore = true;
  }

  private async persist(): Promise<void> {
    await this.store.save(this.session);
  }

  private async refreshSession(): Promise<AuthSession | null> {
    const refreshToken = this.session?.refreshToken;
    if (!refreshToken) {
      this.session = null;
      await this.persist();
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
        await this.persist();
        return null;
      }
      this.session = this.toSession(body, this.session?.email ?? body.user.email ?? null);
      await this.persist();
      return this.session;
    } catch {
      this.session = null;
      await this.persist();
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
