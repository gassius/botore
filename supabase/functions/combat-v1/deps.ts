/**
 * combat-v1 Edge Function dependency wiring (F2).
 *
 * Auth is fail-closed: only Auth `getUser(jwt)` success authenticates.
 * No HS256 fallback and no publicly known local JWT-secret default.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import type { CombatDeps, FightContext } from './handler.ts';

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

export type AdminClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type CombatClientFactories = {
  /** User-scoped client used only for `auth.getUser(jwt)`. */
  createUserClient?: (url: string, key: string) => AuthUserClient;
  /** Service-role client used for `prepare_fight_context`. */
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
  };
}

/**
 * Build injectable combat deps from environment.
 *
 * Missing anon/service keys → getUserId always fails closed (null).
 * Auth rejection → null. No local JWT-secret fallback.
 */
export function createCombatDeps(
  env: EnvReader = Deno.env,
  factories: CombatClientFactories = {},
): CombatDeps {
  const supabaseUrl = env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const anonKey = env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const createUserClient = factories.createUserClient ?? defaultUserClient;
  const createAdminClient = factories.createAdminClient ?? defaultAdminClient;

  return {
    async getUserId(authHeader: string) {
      const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!jwt) return null;

      const apiKey = anonKey || serviceKey;
      // Fail closed when Edge has no Auth client credentials configured.
      if (!apiKey) return null;

      const userClient = createUserClient(supabaseUrl, apiKey);
      const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
      if (userError || !userData.user?.id) return null;
      return userData.user.id;
    },
    async prepareFightContext(accountId: string, opponentId: string) {
      const adminKey = serviceKey || anonKey;
      if (!adminKey) {
        throw new Error('missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY');
      }
      const admin = createAdminClient(supabaseUrl, adminKey);
      const { data: ctxRaw, error: ctxError } = await admin.rpc('prepare_fight_context', {
        p_account_id: accountId,
        p_opponent_id: opponentId,
      });
      if (ctxError) {
        throw new Error(ctxError.message);
      }
      return ctxRaw as FightContext;
    },
  };
}
