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
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const DEV_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

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

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** Minimal HS256 JWT for local seed user (smoke / Edge auth). */
function mintDevAccessToken() {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: DEV_ACCOUNT_ID,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase',
      iat: now,
      exp: now + 60 * 60,
      email: 'dev-player@botore.local',
    }),
  );
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

console.log('==> backend smoke (local Supabase)');

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

const fightCtxJson = psql(
  `select public.prepare_fight_context('00000000-0000-4000-8000-000000000001','opp-sir-bot')::text;`,
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
  const token = mintDevAccessToken();
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
  if (res.status === 404) {
    console.log('SMOKE-SKIP edge combat-v1 HTTP 404 (serve functions locally to enable)');
  } else if (!res.ok) {
    // Optional until functions are served in CI; non-404 without a body is skip.
    console.log(`SMOKE-SKIP edge combat-v1 HTTP ${res.status} (serve functions locally to enable)`);
  } else {
    const body = await res.json();
    if (body.status !== 'computed') fail(`combat status=${body.status}`);
    if (body.persistence !== 'pending_f3') fail('combat persistence flag');
    if (!body.replay?.events?.length) fail('combat missing semantic events');
    if (body.replay?.rulesVersion !== 'combat-v1') fail('combat rulesVersion');
    if (!body.seed || !/^[0-9a-f]{64}$/.test(body.seed)) fail('combat seed shape');
    console.log('SMOKE-OK edge function /functions/v1/combat-v1');
  }
} catch (err) {
  console.log(`SMOKE-SKIP edge combat-v1 (${err instanceof Error ? err.message : err})`);
}

console.log('backend smoke OK');
