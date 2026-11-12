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
      getUserById: (id: string) => Promise<{
        data: { user: { id: string; email?: string | null } | null };
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
            data: IdentityRow | Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
        maybeSingle: () => Promise<{
          data: IdentityRow | Record<string, unknown> | null;
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
  /** service_role RPCs (B5 ensure_player_character). */
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
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
  if (!data || typeof data !== 'object' || !('account_id' in data)) return null;
  return data as IdentityRow;
}

/** R5: soft-deleted accounts must not receive new sessions. */
export async function isAccountDeleted(
  admin: PlatformAuthAdmin,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('accounts')
    .select('deleted_at')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') return false;
  const deletedAt = (data as { deleted_at?: string | null }).deleted_at;
  return deletedAt != null && String(deletedAt).length > 0;
}

export async function ensureAccountRow(admin: PlatformAuthAdmin, accountId: string): Promise<void> {
  const { error } = await admin.from('accounts').insert({ id: accountId });
  // Unique violation / duplicate is fine (idempotent).
  if (error && !/duplicate|unique/i.test(error.message)) {
    throw new Error(error.message);
  }
}

export type EnsurePlayerCharacterResult =
  | {
      readonly ok: true;
      readonly created: boolean;
      readonly characterId: string;
      readonly displayName: string;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * B5: idempotent player character + starter loadout via DB RPC.
 * Must run after accounts row exists; service_role only.
 */
export async function ensurePlayerCharacterForAccount(
  admin: PlatformAuthAdmin,
  accountId: string,
): Promise<EnsurePlayerCharacterResult> {
  const { data, error } = await admin.rpc('ensure_player_character', {
    p_account_id: accountId,
  });
  if (error) {
    return { ok: false, code: 'ensure_player_character_failed', message: error.message };
  }
  if (!data || typeof data !== 'object') {
    return {
      ok: false,
      code: 'ensure_player_character_failed',
      message: 'ensure_player_character returned empty body',
    };
  }
  const body = data as Record<string, unknown>;
  if (body.ok !== true) {
    return {
      ok: false,
      code: typeof body.code === 'string' ? body.code : 'ensure_player_character_failed',
      message:
        typeof body.message === 'string'
          ? body.message
          : 'ensure_player_character returned ok:false',
    };
  }
  const characterId = typeof body.characterId === 'string' ? body.characterId : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName : characterId;
  if (!characterId) {
    return {
      ok: false,
      code: 'ensure_player_character_failed',
      message: 'ensure_player_character missing characterId',
    };
  }
  return {
    ok: true,
    created: body.created === true,
    characterId,
    displayName,
  };
}

export type InsertIdentityResult =
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

export async function insertIdentity(
  admin: PlatformAuthAdmin,
  input: {
    accountId: string;
    provider: PlatformProvider;
    platformId: string;
    linkedAt?: string | null;
  },
): Promise<InsertIdentityResult> {
  const { error } = await admin.from('player_identities').insert({
    account_id: input.accountId,
    provider: input.provider,
    platform_id: input.platformId,
    linked_at: input.linkedAt ?? null,
  });
  if (!error) return { ok: true };
  if (!/duplicate|unique/i.test(error.message)) {
    return { ok: false, code: 'identity_insert_failed', message: error.message };
  }
  // Concurrent mint: unique (provider, platform_id) race — continue only when
  // the winning row already points at this account; else progress would split.
  const existing = await lookupIdentity(admin, input.provider, input.platformId);
  if (!existing || existing.account_id !== input.accountId) {
    return {
      ok: false,
      code: 'session_account_mismatch',
      message: `identity ${existing?.account_id ?? 'missing'} !== ${input.accountId}`,
    };
  }
  return { ok: true };
}

function isTransientVerifyFailure(message: string | undefined): boolean {
  if (!message) return true;
  return /otp|token|expired|invalid|403|forbidden|already|used|verify/i.test(message);
}

type LinkedMagic = {
  readonly userId: string;
  readonly hashedToken: string;
};

async function generateMagicLink(
  admin: PlatformAuthAdmin,
  email: string,
): Promise<
  | { readonly ok: true; readonly link: LinkedMagic }
  | { readonly ok: false; readonly message: string }
> {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.user?.id) {
    return { ok: false, message: link.error?.message ?? 'generateLink failed' };
  }
  const hashed = link.data.properties?.hashed_token;
  if (!hashed) {
    return { ok: false, message: 'generateLink missing hashed_token' };
  }
  return { ok: true, link: { userId: link.data.user.id, hashedToken: hashed } };
}

/**
 * verifyOtp with one fresh-link retry. Concurrent platform-auth calls for the
 * same identity can race: the first verifyOtp consumes the hashed token and the
 * second surfaces as 403 / invalid. A fresh generateLink recovers.
 */
export async function verifyOtpWithRetry(
  admin: PlatformAuthAdmin,
  email: string,
  first: LinkedMagic,
): Promise<
  | {
      readonly ok: true;
      readonly userId: string;
      readonly session: {
        readonly accessToken: string;
        readonly refreshToken: string;
        readonly expiresAt: number | null;
        readonly email: string;
      };
    }
  | { readonly ok: false; readonly code: string; readonly message: string }
> {
  const verify = async (hashedToken: string) => {
    const verified = await admin.auth.verifyOtp({
      type: 'magiclink',
      token_hash: hashedToken,
    });
    const session = verified.data.session;
    if (verified.error || !session?.access_token || !session.refresh_token || !session.user?.id) {
      return {
        ok: false as const,
        message: verified.error?.message ?? 'verifyOtp failed',
      };
    }
    return {
      ok: true as const,
      userId: session.user.id,
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? null,
        email: session.user.email ?? email,
      },
    };
  };

  const primary = await verify(first.hashedToken);
  if (primary.ok) {
    return { ok: true, userId: primary.userId, session: primary.session };
  }

  if (!isTransientVerifyFailure(primary.message)) {
    return { ok: false, code: 'session_verify_failed', message: primary.message };
  }

  const retryLink = await generateMagicLink(admin, email);
  if (!retryLink.ok) {
    return { ok: false, code: 'session_link_failed', message: retryLink.message };
  }
  const secondary = await verify(retryLink.link.hashedToken);
  if (!secondary.ok) {
    return { ok: false, code: 'session_verify_failed', message: secondary.message };
  }
  return { ok: true, userId: secondary.userId, session: secondary.session };
}

/**
 * Resolve mint email for a known account. Prefer the existing auth user's email
 * so generateLink returns **that** user — never a new synthetic for a linked
 * platform id.
 */
export async function resolveMintEmailForAccount(
  admin: PlatformAuthAdmin,
  accountId: string,
  fallbackProvider: PlatformProvider,
  fallbackPlatformId: string,
): Promise<string> {
  const got = await admin.auth.admin.getUserById(accountId);
  if (got.error) throw new Error(got.error.message);
  const email = got.data.user?.email?.trim();
  if (email) return email;
  return syntheticEmailFor(fallbackProvider, fallbackPlatformId);
}

/**
 * Resolve or create auth user for a verified platform id, then mint a session
 * via generateLink(magiclink) + verifyOtp(token_hash).
 *
 * When linking onto an existing device_fallback account A, mints for **A**
 * (getUserById email), never a fresh synthetic user for the platform id.
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

    // R5: ignore soft-deleted accounts (identities should already be unlinked).
    if (accountId && (await isAccountDeleted(admin, accountId))) {
      existing = null;
      accountId = null;
    }

    // Link path: platform proof first time, but device fallback already known.
    if (!accountId && input.fallbackDeviceId) {
      const fallback = await lookupIdentity(admin, 'device_fallback', input.fallbackDeviceId);
      if (fallback) {
        if (await isAccountDeleted(admin, fallback.account_id)) {
          accountId = null;
        } else {
          accountId = fallback.account_id;
        }
      }
    }

    const email = accountId
      ? await resolveMintEmailForAccount(admin, accountId, input.provider, input.platformId)
      : syntheticEmailFor(input.provider, input.platformId);

    const linked = await generateMagicLink(admin, email);
    if (!linked.ok) {
      return { ok: false, code: 'session_link_failed', message: linked.message };
    }
    const userId = linked.link.userId;

    // M1 fail-closed: a DB-only delete (or auth_retire_failed) can leave the
    // Auth user live on the synthetic email. Never re-link or mint for it.
    if (await isAccountDeleted(admin, userId)) {
      return {
        ok: false,
        code: 'account_deleted',
        message: 'This account was deleted and cannot receive a new session',
      };
    }

    if (!accountId) {
      await ensureAccountRow(admin, userId);
      accountId = userId;
      created = true;
    } else if (accountId !== userId) {
      return {
        ok: false,
        code: 'session_account_mismatch',
        message: 'generateLink user does not match linked account',
      };
    }

    if (!existing) {
      const inserted = await insertIdentity(admin, {
        accountId,
        provider: input.provider,
        platformId: input.platformId,
        linkedAt: input.fallbackDeviceId ? new Date().toISOString() : null,
      });
      if (!inserted.ok) {
        return { ok: false, code: inserted.code, message: inserted.message };
      }
    }

    // If platform signed in and fallback was provided, ensure fallback row
    // points at the same account (link after successful platform sign-in).
    if (input.fallbackDeviceId && input.provider !== 'device_fallback') {
      const fallback = await lookupIdentity(admin, 'device_fallback', input.fallbackDeviceId);
      if (!fallback) {
        const linkedFallback = await insertIdentity(admin, {
          accountId,
          provider: 'device_fallback',
          platformId: input.fallbackDeviceId,
          linkedAt: new Date().toISOString(),
        });
        if (!linkedFallback.ok) {
          return {
            ok: false,
            code: linkedFallback.code,
            message: linkedFallback.message,
          };
        }
      }
    }

    // B5: provision before verify so a raced second verify still leaves a
    // playable account. Fail closed only for brand-new accounts; returning
    // players still mint — get_owned_character auto-provisions on Retry Load.
    const ensured = await ensurePlayerCharacterForAccount(admin, accountId);
    if (!ensured.ok) {
      if (created) {
        return {
          ok: false,
          code: ensured.code,
          message: ensured.message,
        };
      }
      console.warn(
        `platform-auth ensure_player_character skipped for returning account ${accountId}: ${ensured.code} ${ensured.message}`,
      );
    }

    const verified = await verifyOtpWithRetry(admin, email, linked.link);
    if (!verified.ok) {
      return { ok: false, code: verified.code, message: verified.message };
    }

    if (verified.userId !== accountId) {
      return {
        ok: false,
        code: 'session_account_mismatch',
        message: 'session user id does not match linked account',
      };
    }

    return {
      ok: true,
      created,
      session: {
        accessToken: verified.session.accessToken,
        refreshToken: verified.session.refreshToken,
        expiresAt: verified.session.expiresAt,
        userId: verified.userId,
        email: verified.session.email,
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
