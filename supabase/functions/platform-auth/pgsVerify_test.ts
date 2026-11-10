import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyPlayGamesProof } from './pgsVerify.ts';

Deno.test('PGS verify exchanges code and returns player_id', async () => {
  const calls: string[] = [];
  const result = await verifyPlayGamesProof(
    { serverAuthCode: 'code-1' },
    {
      webClientId: 'web-client',
      webClientSecret: 'secret',
      applicationId: 'app-123',
      fetch: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('oauth2.googleapis.com/token')) {
          return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 });
        }
        if (url.includes('/applications/app-123/verify')) {
          return new Response(JSON.stringify({ player_id: 'pgs-player-9' }), { status: 200 });
        }
        return new Response('nope', { status: 404 });
      },
    },
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.platformId, 'pgs-player-9');
  assertEquals(calls.length, 2);
});

Deno.test('PGS verify fails closed when misconfigured or exchange fails', async () => {
  const mis = await verifyPlayGamesProof(
    { serverAuthCode: 'x' },
    {
      webClientId: '',
      webClientSecret: '',
      applicationId: '',
      fetch: async () => new Response('{}'),
    },
  );
  assertEquals(mis.ok, false);
  if (!mis.ok) assertEquals(mis.code, 'pgs_misconfigured');

  const fail = await verifyPlayGamesProof(
    { serverAuthCode: 'x' },
    {
      webClientId: 'c',
      webClientSecret: 's',
      applicationId: 'a',
      fetch: async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    },
  );
  assertEquals(fail.ok, false);
  if (!fail.ok) assertEquals(fail.code, 'pgs_token_exchange_failed');
});
