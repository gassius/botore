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
 * Auth repair mirrors `scripts/backend-smoke.mjs` (SQL fixture + Admin recovery).
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
/**
 * Device loopback to host — baked into the release JS bundle.
 * Android emulator: 10.0.2.2 · iOS Simulator: 127.0.0.1
 */
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
      if (key === 'SERVICE_ROLE_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY')
        service = service || val;
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

/**
 * Repair incomplete seed auth.users / auth.identities so GoTrue password grant works.
 * Same shape as `scripts/backend-smoke.mjs` — local/CI only.
 */
function repairAuthFixtureInDb() {
  psql(`
    do $$
    declare
      uid uuid := '${DEV_ACCOUNT_ID}'::uuid;
      has_provider_id boolean;
    begin
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
             created_at = coalesce(created_at, now()),
             updated_at = now()
       where id = uid;

      if not found then
        raise exception 'auth.users seed row missing for %', uid;
      end if;

      begin
        execute format(
          'update auth.users set
             email_change_token_current = %L,
             email_change_confirm_status = 0,
             phone_change = %L,
             phone_change_token = %L,
             reauthentication_token = %L,
             is_sso_user = false,
             is_anonymous = false
           where id = %L',
          '', '', '', '', uid
        );
      exception
        when undefined_column then null;
      end;

      if to_regclass('auth.identities') is null then
        return;
      end if;

      delete from auth.identities where user_id = uid;

      select exists (
        select 1 from information_schema.columns
         where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
      ) into has_provider_id;

      if has_provider_id then
        insert into auth.identities (
          id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) values (
          gen_random_uuid(), uid,
          jsonb_build_object(
            'sub', uid::text,
            'email', '${DEV_EMAIL}',
            'email_verified', true,
            'phone_verified', false
          ),
          'email', uid::text, now(), now(), now()
        );
      else
        insert into auth.identities (
          id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) values (
          gen_random_uuid(), uid,
          jsonb_build_object(
            'sub', uid::text,
            'email', '${DEV_EMAIL}',
            'email_verified', true,
            'phone_verified', false
          ),
          'email', now(), now(), now()
        );
      end if;
    end $$`);

  const check = psql(`
    select json_build_object(
      'email', u.email,
      'has_password', u.encrypted_password is not null,
      'confirmed', u.email_confirmed_at is not null,
      'identities', (select count(*) from auth.identities i where i.user_id = u.id)
    )::text
    from auth.users u
    where u.id = '${DEV_ACCOUNT_ID}'`);
  console.log(`prepare-live-fight-backend: fixture row ${check.trim()}`);
}

async function passwordGrant(anon, email = DEV_EMAIL) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
    signal: AbortSignal.timeout(8000),
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

async function accessTokenViaAdminRecovery(anon, service) {
  const adminHeaders = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    'Content-Type': 'application/json',
  };
  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      type: 'recovery',
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const linkText = await linkRes.text();
  if (!linkRes.ok) {
    return { ok: false, detail: `generate_link HTTP ${linkRes.status}: ${linkText.slice(0, 200)}` };
  }
  let linkBody;
  try {
    linkBody = JSON.parse(linkText);
  } catch {
    return { ok: false, detail: `generate_link non-JSON: ${linkText.slice(0, 200)}` };
  }
  const emailOtp =
    linkBody?.email_otp ||
    linkBody?.properties?.email_otp ||
    linkBody?.hashed_token ||
    linkBody?.properties?.hashed_token;

  const after = await passwordGrant(anon, DEV_EMAIL);
  if (after.ok) return after;

  if (!emailOtp) {
    return {
      ok: false,
      detail: `generate_link missing otp fields: ${linkText.slice(0, 240)}`,
    };
  }

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'recovery',
      email: DEV_EMAIL,
      token: emailOtp,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const verifyText = await verifyRes.text();
  if (!verifyRes.ok) {
    return { ok: false, detail: `verify HTTP ${verifyRes.status}: ${verifyText.slice(0, 200)}` };
  }
  let verifyBody;
  try {
    verifyBody = JSON.parse(verifyText);
  } catch {
    return { ok: false, detail: `verify non-JSON: ${verifyText.slice(0, 200)}` };
  }
  if (typeof verifyBody?.access_token === 'string' && verifyBody.access_token.length > 20) {
    return { ok: true, token: verifyBody.access_token };
  }
  return { ok: false, detail: `verify missing access_token: ${verifyText.slice(0, 200)}` };
}

async function requireDevAccessToken(anon, service) {
  for (const email of [DEV_EMAIL, DEV_EMAIL_SEED]) {
    const attempt = await passwordGrant(anon, email);
    if (attempt.ok) {
      console.log(`prepare-live-fight-backend: password grant ok email=${email}`);
      return attempt;
    }
  }

  console.log('prepare-live-fight-backend: repairing GoTrue seed fixture…');
  repairAuthFixtureInDb();

  let grant = await passwordGrant(anon, DEV_EMAIL);
  if (grant.ok) {
    console.log('prepare-live-fight-backend: password grant ok after SQL repair');
    return grant;
  }
  console.log(`prepare-live-fight-backend: password grant after repair failed: ${grant.detail}`);

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
    signal: AbortSignal.timeout(8000),
  });
  const updText = await upd.text();
  console.log(
    `prepare-live-fight-backend: admin reset HTTP ${upd.status} ${updText.slice(0, 120)}`,
  );
  grant = await passwordGrant(anon, DEV_EMAIL);
  if (grant.ok) {
    console.log('prepare-live-fight-backend: password grant ok after Admin password reset');
    return grant;
  }

  console.log('prepare-live-fight-backend: trying Admin recovery link…');
  const recovery = await accessTokenViaAdminRecovery(anon, service);
  if (recovery.ok) {
    console.log('prepare-live-fight-backend: password/recovery grant ok via Admin link');
    return recovery;
  }

  fail(
    `password grant failed after SQL + Admin repair (${grant.detail}; recovery: ${recovery.detail})`,
  );
}

async function main() {
  const { anon, service } = loadSupabaseKeys();
  console.log(`prepare-live-fight-backend: ${SUPABASE_URL}`);

  // Do NOT GRANT SELECT on characters / fight_allowances / profiles here.
  // SEC #25/#26 keep those tables off authenticated PostgREST; first-run
  // client reads must use sanctioned RPCs/edge paths (or a backend ticket).
  await requireDevAccessToken(anon, service);

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
