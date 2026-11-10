/**
 * Live wiring for platform-auth Edge Function (C12).
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import type { PlatformAuthDeps } from './handler.ts';
import type { PlatformAuthAdmin } from './sessionMint.ts';

export type EnvReader = {
  get(key: string): string | undefined;
};

function asAdmin(client: SupabaseClient): PlatformAuthAdmin {
  return {
    auth: {
      admin: {
        async generateLink(args) {
          const { data, error } = await client.auth.admin.generateLink(args);
          return {
            data: {
              user: data.user
                ? { id: data.user.id, email: data.user.email ?? undefined }
                : null,
              properties: data.properties
                ? {
                    hashed_token: (data.properties as { hashed_token?: string }).hashed_token,
                    email_otp: (data.properties as { email_otp?: string }).email_otp,
                  }
                : null,
            },
            error: error ? { message: error.message } : null,
          };
        },
      },
      async verifyOtp(args) {
        const { data, error } = await client.auth.verifyOtp(args);
        return {
          data: {
            session: data.session
              ? {
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                  expires_at: data.session.expires_at,
                  user: data.session.user
                    ? { id: data.session.user.id, email: data.session.user.email ?? undefined }
                    : undefined,
                }
              : null,
          },
          error: error ? { message: error.message } : null,
        };
      },
    },
    from(table: string) {
      return {
        select(cols: string) {
          return {
            eq(col: string, val: string) {
              const first = {
                eq(col2: string, val2: string) {
                  return {
                    async maybeSingle() {
                      const { data, error } = await client
                        .from(table)
                        .select(cols)
                        .eq(col, val)
                        .eq(col2, val2)
                        .maybeSingle();
                      return {
                        data: data as {
                          account_id: string;
                          provider: string;
                          platform_id: string;
                        } | null,
                        error: error ? { message: error.message } : null,
                      };
                    },
                  };
                },
                async maybeSingle() {
                  const { data, error } = await client
                    .from(table)
                    .select(cols)
                    .eq(col, val)
                    .maybeSingle();
                  return {
                    data: data as {
                      account_id: string;
                      provider: string;
                      platform_id: string;
                    } | null,
                    error: error ? { message: error.message } : null,
                  };
                },
              };
              return first;
            },
          };
        },
        async insert(row: Record<string, unknown>) {
          const { data, error } = await client.from(table).insert(row);
          return { data, error: error ? { message: error.message } : null };
        },
        update(row: Record<string, unknown>) {
          return {
            async eq(col: string, val: string) {
              const { data, error } = await client.from(table).update(row).eq(col, val);
              return { data, error: error ? { message: error.message } : null };
            },
          };
        },
      };
    },
  };
}

export function createPlatformAuthDeps(env: EnvReader = Deno.env): PlatformAuthDeps {
  const url = env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey) {
    throw new Error('platform-auth requires SUPABASE_SERVICE_ROLE_KEY');
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fetchImpl = globalThis.fetch.bind(globalThis);

  return {
    admin: asAdmin(client),
    fetch: fetchImpl,
    gc: {
      nowMs: () => Date.now(),
      fetch: fetchImpl,
    },
    pgs: {
      fetch: fetchImpl,
      webClientId: env.get('PLAY_GAMES_WEB_CLIENT_ID') ?? '',
      webClientSecret: env.get('PLAY_GAMES_WEB_CLIENT_SECRET') ?? '',
      applicationId: env.get('PLAY_GAMES_APPLICATION_ID') ?? '',
    },
  };
}
