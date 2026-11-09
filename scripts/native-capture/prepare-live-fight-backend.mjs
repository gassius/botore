#!/usr/bin/env node
/**
 * C3 — prepare local Supabase for Android live first-run fight captures.
 *
 * Prerequisites: `pnpm exec supabase start` + `pnpm exec supabase db reset --local`
 * and Edge Functions serving (`supabase functions serve`).
 *
 * Repairs the seed GoTrue fixture (dev-player@example.com / local-only-password),
 * verifies password grant, writes capture env for Metro bake + emulator (10.0.2.2).
 *
 * Usage:
 *   node scripts/native-capture/prepare-live-fight-backend.mjs
 *   node scripts/native-capture/prepare-live-fight-backend.mjs --write apps/game/.env
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
/** Emulator loopback to host — baked into the release JS bundle. */
const EMULATOR_SUPABASE_URL = process.env.CAPTURE_EMULATOR_SUPABASE_URL ?? 'http://10.0.2.2:54321';
const DEV_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const DEV_EMAIL_SEED = 'dev-player@botore.local';
const DEV_EMAIL = 'dev-player@example.com';
const DEV_PASSWORD = 'local-only-password';

function fail(msg) {
  console.error(`prepare-live-fight-backend: ${msg}`);
  process.exit(1);
}

function loadSupabaseKeys() {
  let anon = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? '';
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '';
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
      if (key === 'SERVICE_ROLE_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY') service = service || val;
    }
  }
  if (!anon || !service) fail('missing ANON_KEY / SERVICE_ROLE_KEY (start supabase first)');
  return { anon, service };
}

function psql(sql) {
  const res = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    fail(`psql failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function repairAuthFixtureInDb() {
  const sqlFile = join(ROOT, 'scripts/native-capture/repair-capture-auth.sql');
  const res = spawnSync('psql', [DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-f', sqlFile], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    fail(`auth repair failed: ${res.stderr || res.stdout}`);
  }
  const check = psql(
    `select count(*)::int from auth.users where id = '${DEV_ACCOUNT_ID}'::uuid and email = '${DEV_EMAIL}';`,
  );
  if (!/\b1\b/.test(check)) fail(`auth.users seed missing after repair (${check.trim()})`);
}

async function passwordGrant(anon, email = DEV_EMAIL) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
  });
  const text = await res.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  if (!res.ok || typeof body.access_token !== 'string') {
    return {
      ok: false,
      detail: `HTTP ${res.status} email=${email} body=${text.slice(0, 240)}`,
    };
  }
  return { ok: true, token: body.access_token };
}

async function main() {
  const { anon, service } = loadSupabaseKeys();
  console.log(`prepare-live-fight-backend: ${SUPABASE_URL}`);

  let grant = await passwordGrant(anon, DEV_EMAIL);
  if (!grant.ok) {
    grant = await passwordGrant(anon, DEV_EMAIL_SEED);
  }
  if (!grant.ok) {
    console.log('prepare-live-fight-backend: repairing GoTrue seed fixture…');
    repairAuthFixtureInDb();
    grant = await passwordGrant(anon, DEV_EMAIL);
  }
  if (!grant.ok) {
    // Admin password reset fallback
    const upd = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${DEV_ACCOUNT_ID}`, {
      method: 'PUT',
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
        email_confirm: true,
      }),
    });
    console.log(`prepare-live-fight-backend: admin reset HTTP ${upd.status}`);
    grant = await passwordGrant(anon, DEV_EMAIL);
  }
  if (!grant.ok) fail(`password grant failed: ${grant.detail}`);
  console.log(`prepare-live-fight-backend: password grant ok email=${DEV_EMAIL}`);

  const envBody = [
    `EXPO_PUBLIC_DESIGN_CAPTURE=1`,
    `EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT=1`,
    `EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE=Stable`,
    `EXPO_PUBLIC_SUPABASE_URL=${EMULATOR_SUPABASE_URL}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    '',
  ].join('\n');

  const writeIdx = process.argv.indexOf('--write');
  if (writeIdx >= 0 && process.argv[writeIdx + 1]) {
    const dest = process.argv[writeIdx + 1];
    writeFileSync(dest, envBody, 'utf8');
    console.log(`prepare-live-fight-backend: wrote ${dest}`);
  }

  // Always emit machine-readable lines for the shell job.
  console.log(`CAPTURE_ANON_KEY=${anon}`);
  console.log(`CAPTURE_EMULATOR_SUPABASE_URL=${EMULATOR_SUPABASE_URL}`);
  console.log(`CAPTURE_HOST_SUPABASE_URL=${SUPABASE_URL}`);
  console.log(`CAPTURE_EMAIL=${DEV_EMAIL}`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
