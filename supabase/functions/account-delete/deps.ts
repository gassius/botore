/**
 * account-delete Edge dependency wiring (R5).
 *
 * Auth is fail-closed for the JWT path: only Auth `getUser(jwt)` success
 * authenticates. Public web path uses a one-time deletion code hashed in Edge
 * before the service-role RPC. Auth Admin rewrites email + bans the user so
 * platform-auth can mint a fresh account for the same GC/PGS id later.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export type EnvReader = {
  get(key: string): string | undefined;
};

export type AuthUserClient = {
  auth: {
    getUser: (
      jwt: string,
    ) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
};

export type DeleteRpcResult =
  | { ok: true; repeated?: boolean; accountId: string }
  | { ok: false; code?: string; message?: string };

export type AdminClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  auth: {
    admin: {
      updateUserById: (
        id: string,
        attrs: { email?: string; ban_duration?: string; email_confirm?: boolean },
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      signOut?: (
        id: string,
        scope?: 'global' | 'local' | 'others',
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

export type AccountDeleteDeps = {
  getUserId: (authHeader: string) => Promise<string | null>;
  deleteByAccountId: (accountId: string) => Promise<DeleteRpcResult>;
  deleteByCodeHash: (codeHash: string) => Promise<DeleteRpcResult>;
  retireAuthUser: (accountId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  sha256Hex: (input: string) => Promise<string>;
};

export type AccountDeleteClientFactories = {
  createUserClient?: (url: string, key: string) => AuthUserClient;
  createAdminClient?: (url: string, key: string) => AdminClient;
};

function defaultUserClient(url: string, key: string): AuthUserClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as AuthUserClient;
}

function defaultAdminClient(url: string, key: string): AdminClient {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as SupabaseClient;
  return {
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    auth: {
      admin: {
        async updateUserById(id, attrs) {
          const { data, error } = await client.auth.admin.updateUserById(id, attrs);
          return { data, error: error ? { message: error.message } : null };
        },
        async signOut(id, scope = 'global') {
          const admin = client.auth.admin as {
            signOut?: (
              userId: string,
              scope?: string,
            ) => Promise<{ data: unknown; error: { message: string } | null }>;
          };
          if (typeof admin.signOut !== 'function') {
            return { data: null, error: null };
          }
          const { data, error } = await admin.signOut(id, scope);
          return { data, error: error ? { message: error.message } : null };
        },
      },
    },
  };
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseDeleteRpc(data: unknown): DeleteRpcResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, code: 'bad_rpc', message: 'empty delete RPC result' };
  }
  const row = data as Record<string, unknown>;
  if (row.ok === true && typeof row.accountId === 'string') {
    return {
      ok: true,
      repeated: row.repeated === true,
      accountId: row.accountId,
    };
  }
  return {
    ok: false,
    code: typeof row.code === 'string' ? row.code : 'delete_failed',
    message: typeof row.message === 'string' ? row.message : 'delete RPC failed',
  };
}

/**
 * Build injectable account-delete deps from environment.
 * Missing keys → JWT getUser fails closed (null).
 */
export function createAccountDeleteDeps(
  env: EnvReader = Deno.env,
  factories: AccountDeleteClientFactories = {},
): AccountDeleteDeps {
  const supabaseUrl = env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const anonKey = env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const createUserClient = factories.createUserClient ?? defaultUserClient;
  const createAdminClient = factories.createAdminClient ?? defaultAdminClient;

  function requireAdmin(): AdminClient {
    if (!serviceKey) {
      throw new Error('missing SUPABASE_SERVICE_ROLE_KEY');
    }
    return createAdminClient(supabaseUrl, serviceKey);
  }

  return {
    async getUserId(authHeader: string) {
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) return null;
      const apiKey = anonKey || serviceKey;
      if (!apiKey) return null;
      // Reject bare anon/service keys used as Bearer (public web must use code path).
      if (anonKey && jwt === anonKey) return null;
      if (serviceKey && jwt === serviceKey) return null;

      const userClient = createUserClient(supabaseUrl, apiKey);
      const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
      if (userError || !userData.user?.id) return null;
      return userData.user.id;
    },
    async deleteByAccountId(accountId: string) {
      const admin = requireAdmin();
      const { data, error } = await admin.rpc('admin_delete_account', {
        p_account_id: accountId,
      });
      if (error) {
        return { ok: false, code: 'rpc_error', message: error.message };
      }
      return parseDeleteRpc(data);
    },
    async deleteByCodeHash(codeHash: string) {
      const admin = requireAdmin();
      const { data, error } = await admin.rpc('admin_delete_account_by_code_hash', {
        p_code_hash: codeHash,
      });
      if (error) {
        return { ok: false, code: 'rpc_error', message: error.message };
      }
      return parseDeleteRpc(data);
    },
    async retireAuthUser(accountId: string) {
      const admin = requireAdmin();
      const retiredEmail = `deleted.${accountId.replace(/-/g, '')}@deleted.botore.internal`;
      const updated = await admin.auth.admin.updateUserById(accountId, {
        email: retiredEmail,
        email_confirm: true,
        // ~100 years — Auth Admin requires a duration string for ban.
        ban_duration: '876000h',
      });
      if (updated.error) {
        return { ok: false, message: updated.error.message };
      }
      if (typeof admin.auth.admin.signOut === 'function') {
        await admin.auth.admin.signOut(accountId, 'global');
      }
      return { ok: true };
    },
    sha256Hex,
  };
}
