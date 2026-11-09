/**
 * PostgREST integration for sanctioned client read RPCs (ticket B).
 * Does not extend Fastify — hits local Supabase REST with a seed-user JWT.
 *
 * Requires: supabase start + db:reset (CI database job). Skipped when
 * DATABASE_URL is absent so plain unit runs stay green.
 */
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool as PgPool } from 'pg';
import type pg from 'pg';

const DATABASE_URL = process.env['DATABASE_URL'];
const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const DEV_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const DEV_EMAIL = 'dev-player@example.com';
const DEV_EMAIL_SEED = 'dev-player@botore.local';
const DEV_PASSWORD = 'local-only-password';

const d = DATABASE_URL ? describe : describe.skip;

function loadKeys(): { anon: string; service: string } {
  let anon = process.env['SUPABASE_ANON_KEY'] ?? process.env['ANON_KEY'] ?? '';
  let service = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? process.env['SERVICE_ROLE_KEY'] ?? '';
  if (anon && service) return { anon, service };

  const res = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
  });
  if (res.status === 0 && res.stdout) {
    for (const line of res.stdout.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = (m[2] ?? '').replace(/^"|"$/g, '');
      if (key === 'ANON_KEY' || key === 'SUPABASE_ANON_KEY') anon = anon || val;
      if (key === 'SERVICE_ROLE_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY')
        service = service || val;
    }
  }
  return { anon, service };
}

async function passwordGrant(anon: string, email: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password: DEV_PASSWORD }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return typeof body.access_token === 'string' ? body.access_token : null;
  } catch {
    return null;
  }
}

async function repairAuthFixture(pool: pg.Pool): Promise<void> {
  // Constants only — mirrors scripts/backend-smoke.mjs fixture repair.
  await pool.query(`
    update auth.users
       set instance_id = '00000000-0000-0000-0000-000000000000',
           aud = 'authenticated',
           role = 'authenticated',
           email = '${DEV_EMAIL}',
           encrypted_password = crypt('${DEV_PASSWORD}', gen_salt('bf')),
           email_confirmed_at = now(),
           confirmation_token = '',
           recovery_token = '',
           email_change_token_new = '',
           email_change = '',
           raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
           raw_user_meta_data = '{}'::jsonb,
           updated_at = now()
     where id = '${DEV_ACCOUNT_ID}'::uuid;

    delete from auth.identities where user_id = '${DEV_ACCOUNT_ID}'::uuid;

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      '${DEV_ACCOUNT_ID}'::uuid,
      jsonb_build_object(
        'sub', '${DEV_ACCOUNT_ID}',
        'email', '${DEV_EMAIL}',
        'email_verified', true
      ),
      'email',
      '${DEV_ACCOUNT_ID}',
      now(), now(), now()
    );
  `);
}

async function rpc(
  anon: string,
  token: string,
  name: string,
  body: Record<string, unknown> | null = null,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === null ? '{}' : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

d('client-read RPCs via PostgREST (local supabase)', () => {
  let anon = '';
  let accessToken = '';
  let pool: pg.Pool | null = null;
  let ready = false;

  beforeAll(async () => {
    const keys = loadKeys();
    anon = keys.anon;
    if (!anon || !DATABASE_URL) return;

    pool = new PgPool({ connectionString: DATABASE_URL });
    try {
      accessToken = (await passwordGrant(anon, DEV_EMAIL)) ?? '';
      if (!accessToken) {
        accessToken = (await passwordGrant(anon, DEV_EMAIL_SEED)) ?? '';
      }
      if (!accessToken) {
        await repairAuthFixture(pool);
        accessToken = (await passwordGrant(anon, DEV_EMAIL)) ?? '';
      }
      ready = Boolean(accessToken);
    } catch {
      ready = false;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('auth fixture ready for PostgREST RPC calls', () => {
    expect(anon.length).toBeGreaterThan(20);
    expect(ready).toBe(true);
    expect(accessToken.length).toBeGreaterThan(20);
  });

  it('get_owned_character returns seed hero for auth.uid()', async () => {
    expect(ready).toBe(true);
    const { status, json } = await rpc(anon, accessToken, 'get_owned_character');
    expect(status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      characterId: 'player-hero',
      displayName: 'Hero',
    });
  });

  it('list_opponent_roster returns three system opponents', async () => {
    expect(ready).toBe(true);
    const { status, json } = await rpc(anon, accessToken, 'list_opponent_roster');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    const opponents = json.opponents as Array<{ characterId: string; displayName: string }>;
    expect(Array.isArray(opponents)).toBe(true);
    expect(opponents).toHaveLength(3);
    expect(opponents.map((o) => o.characterId).sort()).toEqual([
      'opp-dex-bot',
      'opp-hp-bot',
      'opp-sir-bot',
    ]);
  });

  it('get_fight_allowance_summary returns utcDay + remaining for caller', async () => {
    expect(ready).toBe(true);
    const { status, json } = await rpc(anon, accessToken, 'get_fight_allowance_summary', {
      p_account_id: DEV_ACCOUNT_ID,
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.utcDay).toBe('string');
    expect((json.utcDay as string).length).toBeGreaterThanOrEqual(10);
    expect(Number(json.allowancesRemaining)).toBeGreaterThanOrEqual(0);
    expect(Number(json.allowancesRemaining)).toBeLessThanOrEqual(3);
  });

  it('get_fight_allowance_summary rejects cross-account p_account_id', async () => {
    expect(ready).toBe(true);
    const { status } = await rpc(anon, accessToken, 'get_fight_allowance_summary', {
      p_account_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
