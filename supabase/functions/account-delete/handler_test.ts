/**
 * Deno tests for R5 account-delete handler.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleAccountDeleteRequest, normalizeDeletionCode } from './handler.ts';
import { sha256Hex, type AccountDeleteDeps } from './deps.ts';

function baseDeps(overrides: Partial<AccountDeleteDeps> = {}): AccountDeleteDeps {
  return {
    getUserId: async () => null,
    deleteByAccountId: async () => ({
      ok: true,
      accountId: '00000000-0000-4000-8000-000000000001',
    }),
    deleteByCodeHash: async () => ({
      ok: true,
      accountId: '00000000-0000-4000-8000-000000000001',
    }),
    retireAuthUser: async () => ({ ok: true }),
    sha256Hex,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://local/account-delete', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

Deno.test('normalizeDeletionCode accepts dashed hex', () => {
  assertEquals(
    normalizeDeletionCode('AaBb-CcDd-EeFf-0011-2233-4455-6677-8899'),
    'aabbccddeeff00112233445566778899',
  );
  assertEquals(normalizeDeletionCode('too-short'), null);
});

Deno.test('OPTIONS returns cors ok', async () => {
  const res = await handleAccountDeleteRequest(
    new Request('http://local/account-delete', { method: 'OPTIONS' }),
    baseDeps(),
  );
  assertEquals(res.status, 200);
});

Deno.test('rejects GET', async () => {
  const res = await handleAccountDeleteRequest(
    new Request('http://local/account-delete', { method: 'GET' }),
    baseDeps(),
  );
  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.code, 'method_not_allowed');
});

Deno.test('requires confirm: true', async () => {
  const res = await handleAccountDeleteRequest(post({ deletionCode: 'a'.repeat(32) }), baseDeps());
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, 'confirmation_required');
});

Deno.test('JWT path deletes by auth.uid()', async () => {
  let deletedId: string | null = null;
  let retiredId: string | null = null;
  const res = await handleAccountDeleteRequest(
    post({ confirm: true }, { authorization: 'Bearer user-jwt' }),
    baseDeps({
      getUserId: async (header) => (header.includes('user-jwt') ? 'acct-1' : null),
      deleteByAccountId: async (id) => {
        deletedId = id;
        return { ok: true, accountId: id };
      },
      retireAuthUser: async (id) => {
        retiredId = id;
        return { ok: true };
      },
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(deletedId, 'acct-1');
  assertEquals(retiredId, 'acct-1');
});

Deno.test('code path hashes then deletes', async () => {
  const code = 'aabbccddeeff00112233445566778899';
  const expectedHash = await sha256Hex(code);
  let seenHash: string | null = null;
  const res = await handleAccountDeleteRequest(
    post({ confirm: true, deletionCode: code }),
    baseDeps({
      deleteByCodeHash: async (hash) => {
        seenHash = hash;
        return { ok: true, accountId: 'acct-code' };
      },
      retireAuthUser: async () => ({ ok: true }),
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(seenHash, expectedHash);
  const body = await res.json();
  assertEquals(body.accountId, 'acct-code');
});

Deno.test('invalid code shape returns 400', async () => {
  const res = await handleAccountDeleteRequest(
    post({ confirm: true, deletionCode: 'nope' }),
    baseDeps(),
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.code, 'bad_code');
});

Deno.test('missing JWT and code returns 401', async () => {
  const res = await handleAccountDeleteRequest(post({ confirm: true }), baseDeps());
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, 'unauthorized');
});

Deno.test('unknown deletion code returns 404', async () => {
  const res = await handleAccountDeleteRequest(
    post({ confirm: true, deletionCode: 'a'.repeat(32) }),
    baseDeps({
      deleteByCodeHash: async () => ({
        ok: false,
        code: 'invalid_code',
        message: 'deletion code not recognized',
      }),
    }),
  );
  assertEquals(res.status, 404);
});

Deno.test('auth retire failure surfaces 500 after DB delete', async () => {
  const res = await handleAccountDeleteRequest(
    post({ confirm: true }, { authorization: 'Bearer user-jwt' }),
    baseDeps({
      getUserId: async () => 'acct-1',
      retireAuthUser: async () => ({ ok: false, message: 'ban failed' }),
    }),
  );
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.code, 'auth_retire_failed');
});
