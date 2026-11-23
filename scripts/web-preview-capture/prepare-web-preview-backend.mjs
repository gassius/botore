#!/usr/bin/env node
/**
 * Repair local Supabase seed auth so design-capture web preview can sign in.
 *
 * Uses the same seed account id as live-fight prep, but keeps the default
 * design-capture email/password (capture@botore.local / design-capture) so we
 * do not enable EXPO_PUBLIC_DESIGN_CAPTURE_LIVE_FIGHT hooks.
 *
 * Prerequisites: supabase start + db reset --local.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const DEV_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const CAPTURE_EMAIL = 'capture@botore.local';
const CAPTURE_PASSWORD = 'design-capture';

function fail(msg) {
  console.error(`prepare-web-preview-backend: ${msg}`);
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
      if (key === 'SERVICE_ROLE_KEY' || key === 'SUPABASE_SERVICE_ROLE_KEY') {
        service = service || val;
      }
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

function repairCaptureAuthFixture() {
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
             email = '${CAPTURE_EMAIL}',
             encrypted_password = crypt('${CAPTURE_PASSWORD}', gen_salt('bf')),
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
            'email', '${CAPTURE_EMAIL}',
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
            'email', '${CAPTURE_EMAIL}',
            'email_verified', true,
            'phone_verified', false
          ),
          'email', now(), now(), now()
        );
      end if;
    end $$`);
}

async function passwordGrant(anon) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: CAPTURE_EMAIL, password: CAPTURE_PASSWORD }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) {
    fail(`password grant failed HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`password grant non-JSON: ${text.slice(0, 240)}`);
  }
  if (typeof body.access_token !== 'string') {
    fail(`password grant missing access_token: ${text.slice(0, 240)}`);
  }
}

async function main() {
  const { anon } = loadSupabaseKeys();
  repairCaptureAuthFixture();
  await passwordGrant(anon);
  console.log(`prepare-web-preview-backend: OK email=${CAPTURE_EMAIL} supabase=${SUPABASE_URL}`);
  // Emit for workflow env steps (anon already known via supabase status).
  process.stdout.write(`WEB_PREVIEW_CAPTURE_EMAIL=${CAPTURE_EMAIL}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
