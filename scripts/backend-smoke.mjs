#!/usr/bin/env node
/**
 * Backend smoke test against a live local Supabase project.
 *
 * Prerequisites: `pnpm env:up && pnpm db:reset`
 *
 * Checks:
 *   - Postgres backend_health_snapshot() reports proof seed OK
 *   - Catalogue / loadout / inventory counts
 *   - prepare_fight_context eligibility (F2)
 *   - Optional Edge Functions /health and /combat-v1 when reachable
 *
 * Usage:
 *   node scripts/backend-smoke.mjs
 *   DATABASE_URL=... node scripts/backend-smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCombatSmokeResponse } from './smoke-combat-assert.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const DEV_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const DEV_EMAIL = 'dev-player@botore.local';
const DEV_PASSWORD = 'local-only-password';

/** Load ANON_KEY / SERVICE_ROLE_KEY from env or `supabase status -o env`. */
function loadSupabaseKeys() {
  let anon = process.env.SUPABASE_ANON_KEY ?? '';
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (anon && service) return { anon, service };

  const res = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  if (res.status === 0 && res.stdout) {
    for (const line of res.stdout.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].replace(/^"|"$/g, '');
      if (key === 'ANON_KEY' || key === 'SUPABASE_ANON_KEY') anon = anon || val;
      if (key === 'SERVICE_ROLE_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY')
        service = service || val;
    }
  }
  return { anon, service };
}

const { anon: ANON_KEY, service: SERVICE_ROLE_KEY } = loadSupabaseKeys();

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}

function psql(sql) {
  const res = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    fail(`psql error: ${res.stderr || res.stdout || res.error}`);
  }
  return (res.stdout || '').trim();
}

/** Password-grant a real Auth access token (Edge getUser must accept it). */
async function passwordGrantAccessToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (typeof body.access_token === 'string' && body.access_token.length > 20) {
    return body.access_token;
  }
  return null;
}

/** Repair incomplete seed auth.users / auth.identities so GoTrue password grant works. */
function repairAuthFixtureInDb() {
  // Keep this idempotent and local-only; does not change shipped migrations.
  psql(`
    update auth.users
       set instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
           aud = coalesce(nullif(aud, ''), 'authenticated'),
           role = coalesce(nullif(role, ''), 'authenticated'),
           email = coalesce(email, '${DEV_EMAIL}'),
           encrypted_password = coalesce(
             encrypted_password,
             crypt('${DEV_PASSWORD}', gen_salt('bf'))
           ),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_app_meta_data = coalesce(
             raw_app_meta_data,
             '{"provider":"email","providers":["email"]}'::jsonb
           ),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
           updated_at = now()
     where id = '${DEV_ACCOUNT_ID}'`);

  // Newer GoTrue requires provider_id; older builds ignore unknown columns via DO block.
  psql(`
    do $$
    begin
      if to_regclass('auth.identities') is null then
        return;
      end if;
      if exists (
        select 1 from information_schema.columns
         where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
      ) then
        insert into auth.identities (
          id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        )
        select u.id, u.id,
               jsonb_build_object('sub', u.id::text, 'email', u.email),
               'email', u.id::text, now(), now(), now()
          from auth.users u
         where u.id = '${DEV_ACCOUNT_ID}'::uuid
           and not exists (
             select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
           );
      else
        insert into auth.identities (
          id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        )
        select u.id, u.id,
               jsonb_build_object('sub', u.id::text, 'email', u.email),
               'email', now(), now(), now()
          from auth.users u
         where u.id = '${DEV_ACCOUNT_ID}'::uuid
           and not exists (
             select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
           );
      end if;
    end $$`);
}

/**
 * Ensure a valid local Auth fixture for the seed account, then password-grant.
 * Does not mint JWTs against the public local default secret — Edge auth is fail-closed.
 */
async function requireDevAccessToken() {
  if (!ANON_KEY) fail('SUPABASE_ANON_KEY missing — cannot Auth-login for combat smoke');
  if (!SERVICE_ROLE_KEY) {
    fail('SUPABASE_SERVICE_ROLE_KEY missing — cannot repair Auth fixture for combat smoke');
  }

  let token = await passwordGrantAccessToken();
  if (token) return token;

  const adminHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Seed may insert an incomplete auth.users row; repair via Admin API + DB identity row.
  repairAuthFixtureInDb();

  const existing = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${DEV_ACCOUNT_ID}`, {
    headers: adminHeaders,
    signal: AbortSignal.timeout(8000),
  });

  if (existing.ok) {
    const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${DEV_ACCOUNT_ID}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
        email_confirm: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!upd.ok) {
      const detail = await upd.text();
      fail(`Auth admin update fixture failed HTTP ${upd.status}: ${detail.slice(0, 200)}`);
    }
  } else {
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        id: DEV_ACCOUNT_ID,
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
        email_confirm: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!created.ok) {
      // User may already exist in a form Admin GET missed; password update path next.
      const detail = await created.text();
      console.log(
        `smoke auth: admin create skipped HTTP ${created.status}: ${detail.slice(0, 120)}`,
      );
      repairAuthFixtureInDb();
      const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${DEV_ACCOUNT_ID}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({
          email: DEV_EMAIL,
          password: DEV_PASSWORD,
          email_confirm: true,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!upd.ok) {
        const updDetail = await upd.text();
        fail(`Auth admin update fixture failed HTTP ${upd.status}: ${updDetail.slice(0, 200)}`);
      }
    }
  }

  token = await passwordGrantAccessToken();
  if (!token) {
    fail(
      'Auth password grant failed after fixture repair — combat smoke needs a real access token',
    );
  }
  return token;
}

console.log('==> backend smoke (local Supabase)');
console.log(
  `smoke auth: anonKey=${ANON_KEY ? `set(${ANON_KEY.length})` : 'missing'} serviceRole=${SERVICE_ROLE_KEY ? `set(${SERVICE_ROLE_KEY.length})` : 'missing'}`,
);

const healthJson = psql('select public.backend_health_snapshot()::text;');
let health;
try {
  health = JSON.parse(healthJson);
} catch {
  fail(`backend_health_snapshot did not return JSON: ${healthJson}`);
}

if (health.status !== 'ok') {
  fail(`health status=${health.status} body=${healthJson}`);
}
if (!health.checks?.parts_catalogue?.proof_seed_ok) {
  fail(`proof seed not OK: ${healthJson}`);
}
if ((health.checks?.bot_loadouts?.current_count ?? 0) < 4) {
  fail(`expected >= 4 current loadouts, got ${health.checks?.bot_loadouts?.current_count}`);
}
if (!health.checks?.storage?.atlas_bucket) {
  fail('atlas storage bucket missing');
}
if (health.checks?.fight?.edge_function !== 'combat-v1') {
  fail(`expected fight.edge_function=combat-v1, got ${JSON.stringify(health.checks?.fight)}`);
}
if ((health.checks?.fight?.ready_as_opponent ?? 0) < 3) {
  fail(`expected >= 3 ready opponents, got ${health.checks?.fight?.ready_as_opponent}`);
}
console.log('SMOKE-OK database health snapshot');

const chassis = Number(
  psql(`select count(*) from parts_catalogue where slot_kind='chassis' and is_active`),
);
const paints = Number(
  psql(`select count(*) from parts_catalogue where slot_kind='paint' and is_active`),
);
const weapons = Number(
  psql(`select count(*) from parts_catalogue where slot_kind='weapon' and is_active`),
);
if (chassis !== 1 || paints !== 2 || weapons !== 3) {
  fail(`catalogue shape chassis=${chassis} paints=${paints} weapons=${weapons}`);
}
console.log('SMOKE-OK catalogue proof shape (1/2/3)');

const owned = Number(
  psql(
    `select count(*) from inventory_balances where account_id='00000000-0000-4000-8000-000000000001'`,
  ),
);
if (owned < 6) fail(`expected player to own >= 6 parts, got ${owned}`);
console.log('SMOKE-OK inventory balances');

const adminRows = Number(psql('select count(*) from admin_loadout_overview'));
if (adminRows < 4) fail(`admin_loadout_overview expected >= 4 rows, got ${adminRows}`);
const fightReady = Number(
  psql(`select count(*) from admin_fight_readiness where readiness='ready_as_opponent'`),
);
if (fightReady !== 3) fail(`admin_fight_readiness opponents expected 3, got ${fightReady}`);
console.log('SMOKE-OK admin reporting views');

// prepare_fight_context requires service_role or matching auth.uid(); smoke uses service_role.
const fightCtxJson = psql(
  `select public.prepare_fight_context('00000000-0000-4000-8000-000000000001','opp-sir-bot')::text
     from (select set_config('request.jwt.claim.role', 'service_role', true)) as _jwt;`,
);
let fightCtx;
try {
  fightCtx = JSON.parse(fightCtxJson);
} catch {
  fail(`prepare_fight_context did not return JSON: ${fightCtxJson}`);
}
if (!fightCtx.ok) fail(`prepare_fight_context not ok: ${fightCtxJson}`);
if (fightCtx.attacker?.characterId !== 'player-hero') fail('attacker characterId');
if (fightCtx.defender?.characterId !== 'opp-sir-bot') fail('defender characterId');
const expectedWeaponKind = psql(
  `select pc.weapon_kind
     from current_bot_loadouts cl
     join parts_catalogue pc on pc.part_id = cl.loadout->>'weapon'
    where cl.character_id='player-hero'`,
);
if (fightCtx.attacker?.weaponKind !== expectedWeaponKind) {
  fail(
    `attacker weaponKind from loadout expected ${expectedWeaponKind}, got ${fightCtx.attacker?.weaponKind}`,
  );
}
if (!['sword', 'axe', 'dagger'].includes(fightCtx.defender?.weaponKind)) {
  fail(`defender weaponKind invalid: ${fightCtx.defender?.weaponKind}`);
}
console.log('SMOKE-OK prepare_fight_context');

// Optional: hit Edge Functions if the API gateway is up.
// Network failures and HTTP 404 (function not served) may skip; any other
// non-2xx (including 503 degraded/error) fails the smoke run.
try {
  const headers = { apikey: ANON_KEY || 'smoke' };
  if (ANON_KEY) headers.Authorization = `Bearer ${ANON_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/health`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) {
    console.log('SMOKE-SKIP edge health HTTP 404 (serve functions locally to enable)');
  } else if (!res.ok) {
    fail(`edge health HTTP ${res.status}`);
  } else {
    const body = await res.json();
    if (body.status !== 'ok') fail(`edge health status=${body.status}`);
    console.log('SMOKE-OK edge function /functions/v1/health');
  }
} catch (err) {
  // fetch network / timeout only — HTTP error statuses are handled above
  console.log(`SMOKE-SKIP edge health (${err instanceof Error ? err.message : err})`);
}

try {
  // Probe whether combat-v1 is served. 404 → optional skip; any other response
  // means the endpoint is live and must pass with a real Auth access token.
  const probe = await fetch(`${SUPABASE_URL}/functions/v1/combat-v1`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY || 'smoke',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    signal: AbortSignal.timeout(5000),
  });
  if (probe.status === 404) {
    console.log('SMOKE-SKIP edge combat-v1 HTTP 404 (serve functions locally to enable)');
  } else {
    const token = await requireDevAccessToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/combat-v1`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY || 'smoke',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
      signal: AbortSignal.timeout(15000),
    });
    let body = null;
    try {
      body = await res.json();
    } catch {
      if (res.ok) fail('edge combat-v1 returned non-JSON success body');
    }
    const verdict = classifyCombatSmokeResponse(res.status, body);
    if (verdict.action === 'skip') {
      // Classifier reserves skip for 404; treated as fail if reached while served.
      fail(`edge combat-v1 unexpected skip while served: ${verdict.reason}`);
    } else if (verdict.action === 'fail') {
      const detail =
        body && typeof body === 'object' ? ` body=${JSON.stringify(body).slice(0, 300)}` : '';
      fail(`edge combat-v1 ${verdict.reason}${detail}`);
    } else {
      console.log('SMOKE-OK edge function /functions/v1/combat-v1');
    }
  }
} catch (err) {
  // fetch network / timeout only — Auth fixture / HTTP failures use fail()
  console.log(`SMOKE-SKIP edge combat-v1 (${err instanceof Error ? err.message : err})`);
}

console.log('backend smoke OK');
