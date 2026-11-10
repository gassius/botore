import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handlePlatformAuthRequest, type PlatformAuthDeps } from './handler.ts';
import type { PlatformAuthAdmin } from './sessionMint.ts';
import { syntheticEmailFor } from './sessionMint.ts';

function memoryAdmin(): PlatformAuthAdmin {
  const identities: Array<{
    account_id: string;
    provider: string;
    platform_id: string;
  }> = [];
  const accounts = new Set<string>();
  let userSeq = 0;

  return {
    auth: {
      admin: {
        async generateLink({ email }) {
          userSeq += 1;
          const id = `00000000-0000-4000-8000-${String(userSeq).padStart(12, '0')}`;
          return {
            data: {
              user: { id, email },
              properties: { hashed_token: `hash-${id}` },
            },
            error: null,
          };
        },
      },
      async verifyOtp({ token_hash }) {
        const id = token_hash.replace('hash-', '');
        return {
          data: {
            session: {
              access_token: `access-${id}`,
              refresh_token: `refresh-${id}`,
              expires_at: 1_800_000_000,
              user: { id, email: 'x@players.botore.internal' },
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
                        (r) =>
                          r.provider === map.provider && r.platform_id === map.platform_id,
                      );
                      return { data: found ?? null, error: null };
                    },
                  };
                },
                async maybeSingle() {
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
}

function testDeps(admin: PlatformAuthAdmin): PlatformAuthDeps {
  const now = 1_700_000_000_000;
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  const fakeCert = new Uint8Array(64);
  fakeCert[0] = 0x30;
  fakeCert[1] = 40;
  fakeCert.set(oid, 10);

  return {
    admin,
    fetch: async () => new Response('{}'),
    gc: {
      nowMs: () => now,
      fetch: async () => new Response(fakeCert, { status: 200 }),
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
    testDeps(admin),
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
    testDeps(admin),
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
    testDeps(admin),
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
    testDeps(admin),
  );
  assertEquals(ok.status, 200);
  const body = await ok.json();
  assertEquals(body.ok, true);
  assertEquals(body.provider, 'device_fallback');
});

Deno.test('rejects unknown provider and non-POST', async () => {
  const admin = memoryAdmin();
  const get = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', { method: 'GET' }),
    testDeps(admin),
  );
  assertEquals(get.status, 405);

  const bad = await handlePlatformAuthRequest(
    new Request('http://local/functions/v1/platform-auth', {
      method: 'POST',
      body: JSON.stringify({ provider: 'anonymous' }),
    }),
    testDeps(admin),
  );
  assertEquals(bad.status, 400);
});
