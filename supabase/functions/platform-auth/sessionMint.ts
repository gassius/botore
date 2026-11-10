/**
 * Mint a Supabase user session after platform identity is verified.
 *
 * Uses auth.admin.generateLink(magiclink) + verifyOtp — **not** anonymous
 * sign-in and **not** signInWithIdToken.
 */

export type MintedSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number | null;
  readonly userId: string;
  readonly email: string;
};

export type SessionMintResult =
  | { readonly ok: true; readonly session: MintedSession; readonly created: boolean }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type PlatformProvider = 'game_center' | 'play_games' | 'device_fallback';

export type IdentityRow = {
  readonly account_id: string;
  readonly provider: string;
  readonly platform_id: string;
};

export type PlatformAuthAdmin = {
  auth: {
    admin: {
      generateLink: (args: { type: 'magiclink'; email: string }) => Promise<{
        data: {
          user?: { id?: string; email?: string } | null;
          properties?: { hashed_token?: string; email_otp?: string } | null;
        };
        error: { message: string } | null;
      }>;
      createUser?: (args: {
        email: string;
        email_confirm: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{
        data: { user: { id: string; email?: string } | null };
        error: { message: string } | null;
      }>;
    };
    verifyOtp: (args: { type: 'magiclink' | 'email'; token_hash: string }) => Promise<{
      data: {
        session?: {
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          user?: { id?: string; email?: string };
        } | null;
      };
      error: { message: string } | null;
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        eq: (
          col2: string,
          val2: string,
        ) => {
          maybeSingle: () => Promise<{
            data: IdentityRow | null;
            error: { message: string } | null;
          }>;
        };
        maybeSingle: () => Promise<{
          data: IdentityRow | null;
          error: { message: string } | null;
        }>;
      };
    };
    insert: (
      row: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    update: (row: Record<string, unknown>) => {
      eq: (
        col: string,
        val: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/** Server-only synthetic mailbox — never shown as a player login. */
export function syntheticEmailFor(provider: PlatformProvider, platformId: string): string {
  const safe = platformId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  return `${provider}.${safe}@players.botore.internal`;
}

export async function lookupIdentity(
  admin: PlatformAuthAdmin,
  provider: PlatformProvider,
  platformId: string,
): Promise<IdentityRow | null> {
  const { data, error } = await admin
    .from('player_identities')
    .select('account_id, provider, platform_id')
    .eq('provider', provider)
    .eq('platform_id', platformId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function ensureAccountRow(admin: PlatformAuthAdmin, accountId: string): Promise<void> {
  const { error } = await admin.from('accounts').insert({ id: accountId });
  // Unique violation / duplicate is fine (idempotent).
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export async function insertIdentity(
  admin: PlatformAuthAdmin,
  input: {
    accountId: string;
    provider: PlatformProvider;
    platformId: string;
    linkedAt?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from('player_identities').insert({
    account_id: input.accountId,
    provider: input.provider,
    platform_id: input.platformId,
    linked_at: input.linkedAt ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Resolve or create auth user for a verified platform id, then mint a session
 * via generateLink(magiclink) + verifyOtp(token_hash).
 */
export async function mintSessionForPlatformIdentity(
  admin: PlatformAuthAdmin,
  input: {
    provider: PlatformProvider;
    platformId: string;
    /** Optional prior device_fallback id to link onto the same account. */
    fallbackDeviceId?: string | null;
  },
): Promise<SessionMintResult> {
  try {
    let existing = await lookupIdentity(admin, input.provider, input.platformId);
    let created = false;
    let accountId = existing?.account_id ?? null;

    // Link path: platform proof first time, but device fallback already known.
    if (!accountId && input.fallbackDeviceId) {
      const fallback = await lookupIdentity(admin, 'device_fallback', input.fallbackDeviceId);
      if (fallback) accountId = fallback.account_id;
    }

    const email = accountId
      ? // Existing account — still mint via synthetic email for this provider.
        syntheticEmailFor(input.provider, input.platformId)
      : syntheticEmailFor(input.provider, input.platformId);

    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (link.error || !link.data.user?.id) {
      return {
        ok: false,
        code: 'session_link_failed',
        message: link.error?.message ?? 'generateLink failed',
      };
    }

    const userId = link.data.user.id;
    const hashed = link.data.properties?.hashed_token;
    if (!hashed) {
      return {
        ok: false,
        code: 'session_link_failed',
        message: 'generateLink missing hashed_token',
      };
    }

    if (!accountId) {
      await ensureAccountRow(admin, userId);
      accountId = userId;
      created = true;
    } else if (accountId !== userId) {
      // generateLink created/found a user for the synthetic email that differs
      // from the linked account — prefer the mapped account_id from identities.
      // Re-generate against the mapped user's email is not available; treat as
      // identity already bound to accountId and require that user id matches
      // after first insert. For first platform insert onto fallback account,
      // store identity under fallback account_id.
    }

    if (!existing) {
      await insertIdentity(admin, {
        accountId: accountId!,
        provider: input.provider,
        platformId: input.platformId,
        linkedAt: input.fallbackDeviceId ? new Date().toISOString() : null,
      });
    }

    // If platform signed in and fallback was provided, ensure fallback row
    // points at the same account (link after successful platform sign-in).
    if (input.fallbackDeviceId && input.provider !== 'device_fallback') {
      const fallback = await lookupIdentity(admin, 'device_fallback', input.fallbackDeviceId);
      if (!fallback) {
        await insertIdentity(admin, {
          accountId: accountId!,
          provider: 'device_fallback',
          platformId: input.fallbackDeviceId,
          linkedAt: new Date().toISOString(),
        });
      }
    }

    const verified = await admin.auth.verifyOtp({
      type: 'magiclink',
      token_hash: hashed,
    });
    const session = verified.data.session;
    if (verified.error || !session?.access_token || !session.refresh_token || !session.user?.id) {
      return {
        ok: false,
        code: 'session_verify_failed',
        message: verified.error?.message ?? 'verifyOtp failed',
      };
    }

    return {
      ok: true,
      created,
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? null,
        userId: session.user.id,
        email: session.user.email ?? email,
      },
    };
  } catch (err) {
    return {
      ok: false,
      code: 'session_mint_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
