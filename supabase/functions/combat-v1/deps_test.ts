/**
 * Entrypoint-level auth wiring tests for combat-v1 deps (F2).
 *
 * Proves fail-closed behavior of createCombatDeps (not handler stubs):
 * - Auth-rejected tokens do not authenticate
 * - Tokens signed with the public local JWT default do not authenticate
 *   when deployment JWT-secret env vars are absent
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createCombatDeps, type EnvReader } from './deps.ts';

/** Public local default from older supabase start docs — must never authenticate. */
const PUBLIC_LOCAL_JWT_DEFAULT = 'super-secret-jwt-token-with-at-least-32-characters-long';

function b64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function mintHs256(secret: string, sub: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase',
      iat: now,
      exp: now + 3600,
    }),
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigBytes = new Uint8Array(sigBuf);
  let binary = '';
  for (const b of sigBytes) binary += String.fromCharCode(b);
  const sig = btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}

/** Env with no deployment JWT-secret variables (and a dummy anon key so Auth is called). */
function envWithoutJwtSecrets(): EnvReader {
  const map: Record<string, string> = {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };
  return {
    get(key: string) {
      if (key === 'SUPABASE_JWT_SECRET' || key === 'JWT_SECRET') return undefined;
      return map[key];
    },
  };
}

Deno.test('Auth-rejected token fails closed when JWT-secret env vars are absent', async () => {
  let getUserCalls = 0;
  const deps = createCombatDeps(envWithoutJwtSecrets(), {
    createUserClient: () => ({
      auth: {
        getUser: async () => {
          getUserCalls += 1;
          return { data: { user: null }, error: { message: 'invalid JWT' } };
        },
      },
    }),
  });

  const id = await deps.getUserId('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.rejected.sig');
  assertEquals(id, null);
  assertEquals(getUserCalls, 1);
});

Deno.test(
  'token signed with public local JWT default cannot authenticate when JWT-secret env vars are absent',
  async () => {
    let getUserCalls = 0;
    const victim = '00000000-0000-4000-8000-000000000099';
    const forged = await mintHs256(PUBLIC_LOCAL_JWT_DEFAULT, victim);

    const deps = createCombatDeps(envWithoutJwtSecrets(), {
      createUserClient: () => ({
        auth: {
          getUser: async (jwt: string) => {
            getUserCalls += 1;
            // Simulate Auth rejecting a forged / non-session token.
            assertEquals(jwt, forged);
            return { data: { user: null }, error: { message: 'user not found' } };
          },
        },
      }),
    });

    const id = await deps.getUserId(`Bearer ${forged}`);
    assertEquals(id, null);
    assertEquals(getUserCalls, 1);
  },
);

Deno.test('missing Auth client credentials fail closed without calling getUser', async () => {
  let getUserCalls = 0;
  const emptyEnv: EnvReader = { get: () => undefined };
  const deps = createCombatDeps(emptyEnv, {
    createUserClient: () => ({
      auth: {
        getUser: async () => {
          getUserCalls += 1;
          return { data: { user: { id: 'should-not-run' } }, error: null };
        },
      },
    }),
  });

  const id = await deps.getUserId('Bearer anything');
  assertEquals(id, null);
  assertEquals(getUserCalls, 0);
});

Deno.test('Auth-accepted token returns user id (no JWT-secret env required)', async () => {
  const deps = createCombatDeps(envWithoutJwtSecrets(), {
    createUserClient: () => ({
      auth: {
        getUser: async () => ({
          data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
          error: null,
        }),
      },
    }),
  });
  const id = await deps.getUserId('Bearer real-session-token');
  assertEquals(id, '00000000-0000-4000-8000-000000000001');
});
