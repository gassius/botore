import {
  assertGcPublicKeyUrl,
  buildGameCenterSignedPayload,
  GC_PUBLIC_KEY_HOST_ALLOWLIST,
  verifyGameCenterProof,
} from './gcVerify.ts';
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('GC publicKeyURL allowlist rejects non-Apple hosts and http', () => {
  const badHost = assertGcPublicKeyUrl('https://evil.example/public-key/x');
  assertEquals('code' in badHost && badHost.code, 'gc_public_key_host_denied');

  const badProto = assertGcPublicKeyUrl('http://static.gc.apple.com/key');
  assertEquals('code' in badProto && badProto.code, 'gc_bad_public_key_url');

  const ok = assertGcPublicKeyUrl(`https://${GC_PUBLIC_KEY_HOST_ALLOWLIST[0]}/public-key/abc`);
  assertEquals(ok instanceof URL, true);
});

Deno.test('GC signed payload order is id + bundle + BE timestamp + salt', () => {
  const salt = new Uint8Array([1, 2, 3]);
  const payload = buildGameCenterSignedPayload('T:player', 'com.botore.game', 1000, salt);
  const enc = new TextEncoder();
  const id = enc.encode('T:player');
  const bundle = enc.encode('com.botore.game');
  assertEquals(payload.slice(0, id.length), id);
  assertEquals(payload.slice(id.length, id.length + bundle.length), bundle);
  assertEquals(payload.slice(payload.length - 3), salt);
  // big-endian 1000
  const ts = payload.slice(id.length + bundle.length, id.length + bundle.length + 8);
  assertEquals(ts[7], 232); // 1000 = 0x3e8
  assertEquals(ts[6], 3);
});

Deno.test('GC verify fails closed on stale timestamp and redirect-blocked fetch', async () => {
  const now = 1_700_000_000_000;
  const stale = await verifyGameCenterProof(
    {
      teamPlayerID: 'T:1',
      bundleId: 'com.botore.game',
      publicKeyURL: 'https://static.gc.apple.com/key',
      signature: btoa('sig'),
      salt: btoa('salt'),
      timestamp: now - 60 * 60 * 1000,
    },
    {
      nowMs: () => now,
      fetch: async () => new Response('nope'),
    },
  );
  assertEquals(stale.ok, false);
  if (!stale.ok) assertEquals(stale.code, 'gc_timestamp_stale');
});

Deno.test('GC verify succeeds when signature verifier returns true', async () => {
  const now = 1_700_000_000_000;
  const pem = `-----BEGIN CERTIFICATE-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo
4lgOEePzNm0tRgeLezV6ffAt0gutU07gHpPQTLHRfPU=
-----END CERTIFICATE-----`;
  // Minimal fake DER-ish bytes containing rsaEncryption OID so extractSpki can find something.
  // For this unit test we bypass extract failure by injecting verifySignature after a custom fetch
  // that returns bytes with the OID embedded, and a verifySignature that ignores SPKI.
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  const fakeCert = new Uint8Array(64);
  fakeCert[0] = 0x30;
  fakeCert[1] = 40;
  fakeCert.set(oid, 10);

  const result = await verifyGameCenterProof(
    {
      teamPlayerID: 'T:ok',
      bundleId: 'com.botore.game',
      publicKeyURL: 'https://static.gc.apple.com/key',
      signature: btoa('sig'),
      salt: btoa('abc'),
      timestamp: now,
    },
    {
      nowMs: () => now,
      fetch: async (_url, init) => {
        assertEquals(init?.redirect, 'error');
        return new Response(fakeCert, { status: 200 });
      },
      verifySignature: async () => true,
    },
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.platformId, 'T:ok');
  // silence unused
  assertEquals(typeof pem, 'string');
});

Deno.test('GC verify rejects invalid signature', async () => {
  const now = 1_700_000_000_000;
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  const fakeCert = new Uint8Array(64);
  fakeCert[0] = 0x30;
  fakeCert[1] = 40;
  fakeCert.set(oid, 10);

  const result = await verifyGameCenterProof(
    {
      teamPlayerID: 'T:bad',
      bundleId: 'com.botore.game',
      publicKeyURL: 'https://static.gc.apple.com/key',
      signature: btoa('sig'),
      salt: btoa('abc'),
      timestamp: now,
    },
    {
      nowMs: () => now,
      fetch: async () => new Response(fakeCert, { status: 200 }),
      verifySignature: async () => false,
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'gc_signature_invalid');
});

// Keep assertRejects import used if needed by future async throws.
void assertRejects;
