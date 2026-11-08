#!/usr/bin/env node
/**
 * Backend smoke test against a live local Supabase project.
 *
 * Prerequisites: `pnpm env:up && pnpm db:reset`
 *
 * Checks:
 *   - Postgres backend_health_snapshot() reports proof seed OK
 *   - Catalogue / loadout / inventory counts
 *   - Optional Edge Function /health when SUPABASE_URL is reachable
 *
 * Usage:
 *   node scripts/backend-smoke.mjs
 *   DATABASE_URL=... node scripts/backend-smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

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
console.log('SMOKE-OK admin reporting views');

// Optional: hit Edge Function if the API gateway is up.
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

console.log('backend smoke OK');
