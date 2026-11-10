import {
  assertGcPublicKeyUrl,
  buildGameCenterSignedPayload,
  extractSpkiFromCertificate,
  GC_PUBLIC_KEY_HOST_ALLOWLIST,
  verifyGameCenterProof,
} from './gcVerify.ts';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.224.0/path/mod.ts';

const fixturesDir = join(dirname(fromFileUrl(import.meta.url)), 'fixtures');

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

Deno.test('Apple gc-prod-10.cer SPKI imports as RSASSA-PKCS1-v1_5', async () => {
  const cert = await Deno.readFile(join(fixturesDir, 'gc-prod-10.cer'));
  const spki = extractSpkiFromCertificate(cert);
  assertEquals(spki !== null, true);
  // Must be longer than AlgorithmIdentifier alone (~15 bytes).
  assertEquals((spki as ArrayBuffer).byteLength > 64, true);

  const key = await crypto.subtle.importKey(
    'spki',
    spki as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  assertEquals(key.type, 'public');
});

Deno.test('Apple gc-prod-4.cer SPKI imports as RSASSA-PKCS1-v1_5', async () => {
  const cert = await Deno.readFile(join(fixturesDir, 'gc-prod-4.cer'));
  const spki = extractSpkiFromCertificate(cert);
  assertEquals(spki !== null, true);
  assertEquals((spki as ArrayBuffer).byteLength > 64, true);
  await crypto.subtle.importKey(
    'spki',
    spki as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
});

Deno.test('GC verify maps importKey/verify throws to gc_signature_invalid', async () => {
  const now = 1_700_000_000_000;
  const cert = await Deno.readFile(join(fixturesDir, 'gc-prod-10.cer'));
  const result = await verifyGameCenterProof(
    {
      teamPlayerID: 'T:throw',
      bundleId: 'com.botore.game',
      publicKeyURL: 'https://static.gc.apple.com/key',
      signature: btoa('sig'),
      salt: btoa('abc'),
      timestamp: now,
    },
    {
      nowMs: () => now,
      fetch: async () => new Response(cert, { status: 200 }),
      verifySignature: async () => {
        throw new Error('Invalid keyData');
      },
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'gc_signature_invalid');
});

Deno.test('GC verify succeeds when signature verifier returns true', async () => {
  const now = 1_700_000_000_000;
  const cert = await Deno.readFile(join(fixturesDir, 'gc-prod-10.cer'));

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
        return new Response(cert, { status: 200 });
      },
      verifySignature: async () => true,
    },
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.platformId, 'T:ok');
});

Deno.test('GC verify rejects invalid signature', async () => {
  const now = 1_700_000_000_000;
  const cert = await Deno.readFile(join(fixturesDir, 'gc-prod-10.cer'));

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
      fetch: async () => new Response(cert, { status: 200 }),
      verifySignature: async () => false,
    },
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, 'gc_signature_invalid');
});
