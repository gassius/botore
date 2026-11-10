/**
 * Deno tests for createAccountDeleteDeps (M6).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createAccountDeleteDeps,
  type AdminClient,
  type AuthUserClient,
  type EnvReader,
} from './deps.ts';

function envOf(map: Record<string, string>): EnvReader {
  return { get: (key) => map[key] };
}

Deno.test('getUserId rejects bare anon and service keys as Bearer', async () => {
  const anon = 'anon-key-value';
  const service = 'service-key-value';
  let getUserCalls = 0;
  const deps = createAccountDeleteDeps(
    envOf({
      SUPABASE_URL: 'http://local',
      SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service,
    }),
    {
      createUserClient: () =>
        ({
          auth: {
            getUser: async () => {
              getUserCalls += 1;
              return { data: { user: { id: 'should-not-run' } }, error: null };
            },
          },
        }) satisfies AuthUserClient,
    },
  );

  assertEquals(await deps.getUserId(`Bearer ${anon}`), null);
  assertEquals(await deps.getUserId(`Bearer ${service}`), null);
  assertEquals(getUserCalls, 0);
});

Deno.test('getUserId returns auth user id for a real JWT', async () => {
  const deps = createAccountDeleteDeps(
    envOf({
      SUPABASE_URL: 'http://local',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    }),
    {
      createUserClient: () => ({
        auth: {
          getUser: async (jwt) => {
            assertEquals(jwt, 'user-access-jwt');
            return { data: { user: { id: 'acct-42' } }, error: null };
          },
        },
      }),
    },
  );

  assertEquals(await deps.getUserId('Bearer user-access-jwt'), 'acct-42');
});

Deno.test('retireAuthUser rewrites email, bans, and signs out with JWT', async () => {
  const updates: Array<{ id: string; attrs: Record<string, unknown> }> = [];
  const signOuts: Array<{ jwt: string; scope?: string }> = [];

  const admin: AdminClient = {
    rpc: async () => ({ data: null, error: null }),
    auth: {
      admin: {
        updateUserById: async (id, attrs) => {
          updates.push({ id, attrs });
          return { data: {}, error: null };
        },
        signOut: async (jwt, scope) => {
          signOuts.push({ jwt, scope });
          return { data: {}, error: null };
        },
      },
    },
  };

  const deps = createAccountDeleteDeps(
    envOf({
      SUPABASE_URL: 'http://local',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    }),
    {
      createAdminClient: () => admin,
    },
  );

  const retired = await deps.retireAuthUser('00000000-0000-4000-8000-000000000099', {
    accessJwt: 'caller-access-jwt',
  });
  assertEquals(retired.ok, true);
  if (!retired.ok) return;
  assertEquals(retired.sessionsRevoked, true);
  assertEquals(updates.length, 1);
  assertEquals(updates[0]?.id, '00000000-0000-4000-8000-000000000099');
  assertEquals(
    updates[0]?.attrs.email,
    'deleted.00000000000040008000000000000099@deleted.botore.internal',
  );
  assertEquals(updates[0]?.attrs.ban_duration, '876000h');
  assertEquals(signOuts, [{ jwt: 'caller-access-jwt', scope: 'global' }]);
});

Deno.test('retireAuthUser code path skips signOut (ban covers refresh)', async () => {
  let signOutCalls = 0;
  const admin: AdminClient = {
    rpc: async () => ({ data: null, error: null }),
    auth: {
      admin: {
        updateUserById: async () => ({ data: {}, error: null }),
        signOut: async () => {
          signOutCalls += 1;
          return { data: {}, error: null };
        },
      },
    },
  };

  const deps = createAccountDeleteDeps(
    envOf({
      SUPABASE_URL: 'http://local',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    }),
    {
      createAdminClient: () => admin,
    },
  );

  const retired = await deps.retireAuthUser('acct-1');
  assertEquals(retired.ok, true);
  if (!retired.ok) return;
  assertEquals(retired.sessionsRevoked, false);
  assertEquals(signOutCalls, 0);
});

Deno.test('retireAuthUser does not claim revoke when signOut throws', async () => {
  const admin: AdminClient = {
    rpc: async () => ({ data: null, error: null }),
    auth: {
      admin: {
        updateUserById: async () => ({ data: {}, error: null }),
        signOut: async () => {
          throw new Error('network');
        },
      },
    },
  };

  const deps = createAccountDeleteDeps(
    envOf({
      SUPABASE_URL: 'http://local',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    }),
    {
      createAdminClient: () => admin,
    },
  );

  const retired = await deps.retireAuthUser('acct-1', { accessJwt: 'jwt' });
  assertEquals(retired.ok, true);
  if (!retired.ok) return;
  assertEquals(retired.sessionsRevoked, false);
});
