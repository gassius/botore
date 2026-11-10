import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.224.0/path/mod.ts';
import { handlePlatformAuthRequest, type PlatformAuthDeps } from './handler.ts';
import type { PlatformAuthAdmin } from './sessionMint.ts';
import { syntheticEmailFor } from './sessionMint.ts';

const appleGcCertPath = join(dirname(fromFileUrl(import.meta.url)), 'fixtures', 'gc-prod-10.cer');

function memoryAdmin(): PlatformAuthAdmin & {
  readonly _accounts: Set<string>;
  readonly _identities: Array<{
    account_id: string;
    provider: string;
    platform_id: string;
  }>;
  readonly _deletedAccounts: Set<string>;
  /** Simulate Auth Admin email rewrite after soft-delete. */
  _retireEmail: (userId: string, retiredEmail: string) => void;
} {
  const identities: Array<{
    account_id: string;
    provider: string;
    platform_id: string;
  }> = [];
  const accounts = new Set<string>();
  const deletedAccounts = new Set<string>();
  const usersByEmail = new Map<string, { id: string; email: string }>();
  const usersById = new Map<string, { id: string; email: string }>();
  let userSeq = 0;

  const admin = {
    _accounts: accounts,
    _identities: identities,
    _deletedAccounts: deletedAccounts,
    _retireEmail(userId: string, retiredEmail: string) {
      const user = usersById.get(userId);
      if (!user) return;
      usersByEmail.delete(user.email);
      const next = { id: userId, email: retiredEmail };
      usersById.set(userId, next);
      usersByEmail.set(retiredEmail, next);
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          const user = usersById.get(id) ?? null;
          return { data: { user }, error: user ? null : { message: 'not found' } };
        },
        async generateLink({ email }: { email: string }) {
          let user = usersByEmail.get(email);
          if (!user) {
            userSeq += 1;
            const id = `00000000-0000-4000-8000-${String(userSeq).padStart(12, '0')}`;
            user = { id, email };
            usersByEmail.set(email, user);
            usersById.set(id, user);
          }
          return {
            data: {
              user: { id: user.id, email: user.email },
              properties: { hashed_token: `hash-${user.id}` },
            },
            error: null,
          };
        },
      },
      async verifyOtp({ token_hash }: { token_hash: string }) {
        const id = token_hash.replace('hash-', '');
        const user = usersById.get(id);
        return {
          data: {
            session: {
              access_token: `access-${id}`,
              refresh_token: `refresh-${id}`,
              expires_at: 1_800_000_000,
              user: { id, email: user?.email ?? 'x@players.botore.internal' },
            },
          },
          error: null,
        };
      },
    },
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              const first = {
                eq(col2: string, val2: string) {
                  return {
                    async maybeSingle() {
                      if (table !== 'player_identities') {
                        return { data: null, error: null };
                      }
                      const map: Record<string, string> = { [col]: val, [col2]: val2 };
                      const found = identities.find(
                        (r) => r.provider === map.provider && r.platform_id === map.platform_id,
                      );
                      return { data: found ?? null, error: null };
                    },
                  };
                },
                async maybeSingle() {
                  if (table === 'accounts' && col === 'id') {
                    if (!accounts.has(val) && !usersById.has(val)) {
                      return { data: null, error: null };
                    }
                    return {
                      data: {
                        deleted_at: deletedAccounts.has(val) ? '2026-11-10T00:00:00Z' : null,
                      },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                },
              };
              return first;
            },
          };
        },
        async insert(row: Record<string, unknown>) {
          if (table === 'accounts') {
            accounts.add(String(row.id));
            return { data: row, error: null };
          }
          if (table === 'player_identities') {
            identities.push({
              account_id: String(row.account_id),
              provider: String(row.provider),
              platform_id: String(row.platform_id),
            });
            return { data: row, error: null };
          }
          return { data: null, error: { message: `unknown table ${table}` } };
        },
        update(_row: Record<string, unknown>) {
          return {
            async eq() {
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };
  return admin as PlatformAuthAdmin & typeof admin;
}

async function testDeps(admin: PlatformAuthAdmin): Promise<PlatformAuthDeps> {
  const now = 1_700_000_000_000;
  // Real Apple cert so extractSpkiFromCertificate succeeds; signature mocked.
  const appleCert = await Deno.readFile(appleGcCertPath);

  return {
    admin,
    fetch: async () => new Response('{}'),
    gc: {
      nowMs: () => now,
      fetch: async () => new Response(appleCert, { status: 200 }),
      verifySignature: async () => true,
    },
    pgs: {
      webClientId: 'wc',
      webClientSecret: 'ws',
      applicationId: 'app',
      fetch: async (input) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        return new Response(JSON.stringify({ player_id: 'pgs-1' }), { status: 200 });
      },
    },
  };
}

Deno.test('synthetic email is server-only players.botore.internal', () => {
  const email = syntheticEmailFor('game_center', 'T:abc');
  assertEquals(email, 'game_center.T_abc@players.botore.internal');
  assertEquals(email.includes('@players.botore.internal'), true);
});

Deno.test('POST game_center mints session and stores identity', async () => {
  const admin = memoryAdmin();
  const res = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'game_center',
        teamPlayerID: 'T:hero',
        bundleId: 'com.botore.game',
        publicKeyURL: 'https://static.gc.apple.com/key',
        signature: btoa('sig'),
        salt: btoa('salt'),
        timestamp: 1_700_000_000_000,
      }),
    }),
    await testDeps(admin),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.provider, 'game_center');
  assertEquals(body.platformId, 'T:hero');
  assertEquals(typeof body.session.access_token, 'string');
});

Deno.test('POST play_games mints session', async () => {
  const admin = memoryAdmin();
  const res = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'play_games',
        serverAuthCode: 'code',
      }),
    }),
    await testDeps(admin),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(body.platformId, 'pgs-1');
});

Deno.test('POST device_fallback rejects short ids; accepts UUID-shaped id', async () => {
  const admin = memoryAdmin();
  const bad = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({ provider: 'device_fallback', deviceId: 'short' }),
    }),
    await testDeps(admin),
  );
  assertEquals(bad.status, 400);

  const ok = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'device_fallback',
        deviceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
    }),
    await testDeps(admin),
  );
  assertEquals(ok.status, 200);
  const body = await ok.json();
  assertEquals(body.ok, true);
  assertEquals(body.provider, 'device_fallback');
});

Deno.test(
  'device_fallback then play_games with same fallbackDeviceId keeps one account',
  async () => {
    const admin = memoryAdmin();
    const deps = await testDeps(admin);
    const deviceId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

    const first = await handlePlatformAuthRequest(
      new Request('http://local/functions/v1/platform-auth', {
        method: 'POST',
        body: JSON.stringify({ provider: 'device_fallback', deviceId }),
      }),
      deps,
    );
    assertEquals(first.status, 200);
    const firstBody = await first.json();
    assertEquals(firstBody.ok, true);
    const userId = firstBody.session.user_id as string;

    const second = await handlePlatformAuthRequest(
      new Request('http://local/functions/v1/platform-auth', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'play_games',
          serverAuthCode: 'code',
          fallbackDeviceId: deviceId,
        }),
      }),
      deps,
    );
    assertEquals(second.status, 200);
    const secondBody = await second.json();
    assertEquals(secondBody.ok, true);
    assertEquals(secondBody.session.user_id, userId);
    assertEquals(secondBody.platformId, 'pgs-1');
    assertEquals(admin._accounts.size, 1);
    assertEquals(admin._accounts.has(userId), true);
    const providers = admin._identities.map((r) => r.provider).sort();
    assertEquals(providers, ['device_fallback', 'play_games']);
    assertEquals(
      admin._identities.every((r) => r.account_id === userId),
      true,
    );
  },
);

Deno.test('rejects unknown provider and non-POST', async () => {
  const admin = memoryAdmin();
  const get = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', { method: 'GET' }),
    await testDeps(admin),
  );
  assertEquals(get.status, 405);

  const bad = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({ provider: 'anonymous' }),
    }),
    await testDeps(admin),
  );
  assertEquals(bad.status, 400);
});

Deno.test('M1: soft-deleted Auth user on synthetic email fails closed (no re-link)', async () => {
  const admin = memoryAdmin();
  const deps = await testDeps(admin);

  // First mint creates the Auth user + identity.
  const first = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'play_games',
        serverAuthCode: 'code',
      }),
    }),
    deps,
  );
  assertEquals(first.status, 200);
  const firstBody = await first.json();
  const userId = firstBody.session.user_id as string;

  // Simulate DB-only delete: mark account deleted and unlink identities,
  // but leave Auth email on the synthetic mailbox (auth_retire_failed).
  admin._deletedAccounts.add(userId);
  admin._identities.splice(0, admin._identities.length);

  const second = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'play_games',
        serverAuthCode: 'code',
      }),
    }),
    deps,
  );
  assertEquals(second.status, 403);
  const secondBody = await second.json();
  assertEquals(secondBody.ok, false);
  assertEquals(secondBody.code, 'account_deleted');
  assertEquals(admin._identities.length, 0);
});

Deno.test('M1: after Auth retire, same platform id mints a fresh account', async () => {
  const admin = memoryAdmin();
  const deps = await testDeps(admin);
  const deviceId = 'cccccccc-dddd-4eee-8fff-000000000001';

  const first = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({ provider: 'device_fallback', deviceId }),
    }),
    deps,
  );
  assertEquals(first.status, 200);
  const firstBody = await first.json();
  const oldUserId = firstBody.session.user_id as string;

  // Soft-delete + Auth retire (email rewritten away from synthetic mailbox).
  admin._deletedAccounts.add(oldUserId);
  admin._identities.splice(0, admin._identities.length);
  admin._retireEmail(oldUserId, `deleted.${oldUserId.replace(/-/g, '')}@deleted.botore.internal`);

  const second = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({ provider: 'device_fallback', deviceId }),
    }),
    deps,
  );
  assertEquals(second.status, 200);
  const secondBody = await second.json();
  assertEquals(secondBody.ok, true);
  assertEquals(secondBody.session.user_id !== oldUserId, true);
});
