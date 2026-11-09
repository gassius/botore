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
 *   - sanctioned client-read RPCs (owned / roster / allowance)
 *   - persist_fight_result idempotent consume + XP (F3)
 *   - process_analytics_outbox + pg_cron jobs (F4)
 *   - Edge Functions /health and /combat-v1 (required when REQUIRE_EDGE_FUNCTIONS=1)
 *
 * Usage:
 *   node scripts/backend-smoke.mjs
 *   DATABASE_URL=... node scripts/backend-smoke.mjs
 *   REQUIRE_EDGE_FUNCTIONS=1 node scripts/backend-smoke.mjs   # CI / full gate
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
/** Seed email uses `.local` which GoTrue may reject; smoke repairs to a valid mailbox. */
const DEV_EMAIL_SEED = 'dev-player@botore.local';
const DEV_EMAIL = 'dev-player@example.com';
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
const REQUIRE_EDGE =
  process.env.REQUIRE_EDGE_FUNCTIONS === '1' || process.env.REQUIRE_EDGE_FUNCTIONS === 'true';

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}

function edgeSkipOrFail(msg) {
  if (REQUIRE_EDGE) fail(msg);
  console.log(`SMOKE-SKIP ${msg}`);
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

function authHeaders(json = true) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

/**
 * Password-grant a real Auth access token (Edge getUser must accept it).
 * Tries seed email then repaired example.com email.
 */
async function passwordGrantAccessToken(email = DEV_EMAIL) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ email, password: DEV_PASSWORD }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (!res.ok) {
    return {
      token: null,
      detail: `HTTP ${res.status} email=${email} body=${text.slice(0, 240)}`,
    };
  }
  if (typeof body?.access_token === 'string' && body.access_token.length > 20) {
    return { token: body.access_token, detail: 'ok' };
  }
  return { token: null, detail: `missing access_token email=${email} body=${text.slice(0, 240)}` };
}

/**
 * Repair incomplete seed auth.users / auth.identities so GoTrue password grant works.
 * Local/CI only — does not change shipped migrations.
 */
function repairAuthFixtureInDb() {
  psql(`
    do $$
    declare
      uid uuid := '${DEV_ACCOUNT_ID}'::uuid;
      has_provider_id boolean;
    begin
      -- GoTrue-compatible row. Swap .local seed email for a mailbox GoTrue accepts.
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

      -- Optional columns on newer GoTrue schemas (ignore if absent).
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
  console.log(`smoke auth: fixture row ${check}`);
}

/** Admin recovery link → OTP verify yields a real Auth access token. */
async function accessTokenViaAdminRecovery() {
  if (!SERVICE_ROLE_KEY) return { token: null, detail: 'no service role key' };
  const adminHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
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
    return {
      token: null,
      detail: `generate_link HTTP ${linkRes.status}: ${linkText.slice(0, 200)}`,
    };
  }
  let linkBody;
  try {
    linkBody = JSON.parse(linkText);
  } catch {
    return { token: null, detail: `generate_link non-JSON: ${linkText.slice(0, 200)}` };
  }
  const emailOtp =
    linkBody?.email_otp ||
    linkBody?.properties?.email_otp ||
    linkBody?.hashed_token ||
    linkBody?.properties?.hashed_token;
  if (!emailOtp) {
    return {
      token: null,
      detail: `generate_link missing otp fields: ${linkText.slice(0, 240)}`,
    };
  }

  // Prefer password grant again after Admin set password via generate_link.
  const after = await passwordGrantAccessToken(DEV_EMAIL);
  if (after.token) return after;

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      type: 'recovery',
      email: DEV_EMAIL,
      token: emailOtp,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const verifyText = await verifyRes.text();
  if (!verifyRes.ok) {
    return {
      token: null,
      detail: `verify HTTP ${verifyRes.status}: ${verifyText.slice(0, 200)}`,
    };
  }
  let verifyBody;
  try {
    verifyBody = JSON.parse(verifyText);
  } catch {
    return { token: null, detail: `verify non-JSON: ${verifyText.slice(0, 200)}` };
  }
  if (typeof verifyBody?.access_token === 'string' && verifyBody.access_token.length > 20) {
    return { token: verifyBody.access_token, detail: 'ok via recovery verify' };
  }
  return { token: null, detail: `verify missing access_token: ${verifyText.slice(0, 200)}` };
}

/**
 * Ensure a valid local Auth fixture for the seed account, then password-grant.
 * Edge auth stays fail-closed (getUser only) — smoke must obtain a real Auth token.
 */
async function requireDevAccessToken() {
  if (!ANON_KEY) fail('SUPABASE_ANON_KEY missing — cannot Auth-login for combat smoke');

  // Try repaired mailbox first, then original seed email.
  for (const email of [DEV_EMAIL, DEV_EMAIL_SEED]) {
    const attempt = await passwordGrantAccessToken(email);
    if (attempt.token) {
      console.log(`smoke auth: password grant ok email=${email}`);
      return attempt.token;
    }
  }

  console.log('smoke auth: repairing GoTrue fixture for seed user via SQL');
  repairAuthFixtureInDb();

  let grant = await passwordGrantAccessToken(DEV_EMAIL);
  if (grant.token) {
    console.log('smoke auth: password grant ok after SQL repair');
    return grant.token;
  }
  console.log(`smoke auth: password grant after repair failed: ${grant.detail}`);

  // After SQL repair, Admin can usually load the user — reset password via Admin then grant.
  if (SERVICE_ROLE_KEY) {
    const adminHeaders = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };
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
    const updText = await upd.text();
    console.log(`smoke auth: admin password reset HTTP ${upd.status} ${updText.slice(0, 120)}`);
    grant = await passwordGrantAccessToken(DEV_EMAIL);
    if (grant.token) {
      console.log('smoke auth: password grant ok after Admin password reset');
      return grant.token;
    }
  }

  console.log('smoke auth: trying Admin recovery link → Auth token');
  const recovery = await accessTokenViaAdminRecovery();
  if (recovery.token) {
    console.log(`smoke auth: ${recovery.detail}`);
    return recovery.token;
  }

  fail(
    `Auth password grant failed after SQL fixture repair — combat smoke needs a real access token (${grant.detail}; recovery: ${recovery.detail})`,
  );
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
if (!health.checks?.storage?.proof_pack_ok) {
  fail(`atlas proof pack not OK (run seed-atlas-storage.mjs): ${healthJson}`);
}
if (health.checks?.fight?.edge_function !== 'combat-v1') {
  fail(`expected fight.edge_function=combat-v1, got ${JSON.stringify(health.checks?.fight)}`);
}
if (health.checks?.fight?.persistence !== 'persist_fight_result') {
  fail(
    `expected fight.persistence=persist_fight_result, got ${JSON.stringify(health.checks?.fight)}`,
  );
}
if ((health.checks?.fight?.ready_as_opponent ?? 0) < 3) {
  fail(`expected >= 3 ready opponents, got ${health.checks?.fight?.ready_as_opponent}`);
}
if (!health.checks?.pg_cron?.present) {
  fail(`expected pg_cron.present=true, got ${JSON.stringify(health.checks?.pg_cron)}`);
}
if (!health.checks?.pg_cron?.outbox_drain_scheduled) {
  fail(`expected outbox_drain_scheduled, got ${JSON.stringify(health.checks?.pg_cron)}`);
}
if (!health.checks?.pg_cron?.allowance_refresh_scheduled) {
  fail(`expected allowance_refresh_scheduled, got ${JSON.stringify(health.checks?.pg_cron)}`);
}
if (health.checks?.analytics_outbox?.processor !== 'process_analytics_outbox') {
  fail(
    `expected analytics_outbox.processor=process_analytics_outbox, got ${JSON.stringify(health.checks?.analytics_outbox)}`,
  );
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
const playerRows = Number(
  psql(
    `select count(*) from admin_players_overview where account_id='00000000-0000-4000-8000-000000000001'`,
  ),
);
if (playerRows !== 1) fail(`admin_players_overview expected 1 seed player, got ${playerRows}`);
const botRows = Number(psql('select count(*) from admin_bots_overview'));
if (botRows < 4) fail(`admin_bots_overview expected >= 4 rows, got ${botRows}`);
const fightStatsJson = psql('select to_jsonb(s)::text from admin_fight_stats s');
let fightStats;
try {
  fightStats = JSON.parse(fightStatsJson);
} catch {
  fail(`admin_fight_stats did not return JSON: ${fightStatsJson}`);
}
if ((fightStats.opponent_bot_count ?? 0) !== 3) {
  fail(`admin_fight_stats.opponent_bot_count expected 3, got ${fightStatsJson}`);
}
const dailyRows = Number(psql('select count(*) from admin_daily_active_accounts'));
if (dailyRows !== 30) fail(`admin_daily_active_accounts expected 30 days, got ${dailyRows}`);
const dashSnapJson = psql('select public.admin_dashboard_snapshot()::text');
let dashSnap;
try {
  dashSnap = JSON.parse(dashSnapJson);
} catch {
  fail(`admin_dashboard_snapshot did not return JSON: ${dashSnapJson}`);
}
if (!dashSnap.ok) fail(`admin_dashboard_snapshot not ok: ${dashSnapJson}`);
if (!Array.isArray(dashSnap.atlasVersions) || dashSnap.atlasVersions.length < 1) {
  fail(`admin_dashboard_snapshot missing atlasVersions: ${dashSnapJson}`);
}
if (!Array.isArray(dashSnap.cronJobs) || dashSnap.cronJobs.length !== 2) {
  fail(`admin_dashboard_snapshot cronJobs expected 2, got ${dashSnapJson}`);
}
// Runs may be empty before cron fires; RPC must still succeed.
psql('select count(*) from public.admin_list_cron_job_runs(5)');
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

// B: sanctioned client-read RPCs (auth.uid()-scoped; smoke uses JWT claims via SQL).
{
  const ownedJson = psql(
    `select public.get_owned_character()::text
       from (select set_config('request.jwt.claim.role', 'authenticated', true),
                    set_config('request.jwt.claim.sub', '${DEV_ACCOUNT_ID}', true)) as _jwt;`,
  );
  let owned;
  try {
    owned = JSON.parse(ownedJson);
  } catch {
    fail(`get_owned_character did not return JSON: ${ownedJson}`);
  }
  if (!owned.ok || owned.characterId !== 'player-hero') {
    fail(`get_owned_character unexpected: ${ownedJson}`);
  }

  const rosterJson = psql(
    `select public.list_opponent_roster()::text
       from (select set_config('request.jwt.claim.role', 'authenticated', true),
                    set_config('request.jwt.claim.sub', '${DEV_ACCOUNT_ID}', true)) as _jwt;`,
  );
  let roster;
  try {
    roster = JSON.parse(rosterJson);
  } catch {
    fail(`list_opponent_roster did not return JSON: ${rosterJson}`);
  }
  if (!roster.ok || !Array.isArray(roster.opponents) || roster.opponents.length !== 3) {
    fail(`list_opponent_roster unexpected: ${rosterJson}`);
  }

  const allowJson = psql(
    `select public.get_fight_allowance_summary()::text
       from (select set_config('request.jwt.claim.role', 'authenticated', true),
                    set_config('request.jwt.claim.sub', '${DEV_ACCOUNT_ID}', true)) as _jwt;`,
  );
  let allow;
  try {
    allow = JSON.parse(allowJson);
  } catch {
    fail(`get_fight_allowance_summary did not return JSON: ${allowJson}`);
  }
  if (
    !allow.ok ||
    typeof allow.utcDay !== 'string' ||
    typeof allow.allowancesRemaining !== 'number'
  ) {
    fail(`get_fight_allowance_summary unexpected: ${allowJson}`);
  }
  console.log('SMOKE-OK client-read RPCs (owned / roster / allowance)');
}

// F3: persist one fight, retry same key, assert no double consume / XP.
{
  const day = psql(`select (now() at time zone 'utc')::date`);
  const atkLoadout = psql(
    `select loadout_version_id from current_bot_loadouts where character_id='player-hero'`,
  );
  const defLoadout = psql(
    `select loadout_version_id from current_bot_loadouts where character_id='opp-sir-bot'`,
  );
  const battleId = psql(`select gen_random_uuid()`);
  const seed = 'ab'.repeat(16);
  const checksum = 'cd'.repeat(32);
  const inputHash = 'ef'.repeat(32);
  const key = `smoke-persist-${Date.now()}`;
  const usedBefore = Number(
    psql(
      `select count(*) from fight_allowances where account_id='${DEV_ACCOUNT_ID}' and utc_day='${day}' and used_at is not null`,
    ),
  );
  const ledgerBefore = Number(
    psql(`select count(*) from progression_ledger where account_id='${DEV_ACCOUNT_ID}'`),
  );

  const persistSql = `
    select public.persist_fight_result(
      '${DEV_ACCOUNT_ID}',
      '${key}',
      'opp-sir-bot',
      '${battleId}',
      '${seed}',
      'combat-v1',
      jsonb_build_object(
        'replayVersion', 1,
        'rulesVersion', 'combat-v1',
        'battleId', '${battleId}',
        'seed', '${seed}',
        'inputHash', '${inputHash}',
        'checksum', '${checksum}',
        'fighters', '[]'::jsonb,
        'events', '[]'::jsonb,
        'outcome', jsonb_build_object('winner','player-hero','loser','opp-sir-bot','reason','defeat')
      ),
      jsonb_build_object(
        'characterId','player-hero','hp',30,'weaponKind','sword','weaponPower',3,
        'loadoutVersionId','${atkLoadout}'
      ),
      jsonb_build_object(
        'characterId','opp-sir-bot','hp',34,'weaponKind','sword','weaponPower',3,
        'loadoutVersionId','${defLoadout}'
      ),
      '${day}'::date
    )::text
    from (select set_config('request.jwt.claim.role','service_role',true)) as _auth;
  `;
  const persistOut = psql(persistSql);
  let persistBody;
  try {
    persistBody = JSON.parse(persistOut);
  } catch {
    fail(`persist_fight_result did not return JSON: ${persistOut}`);
  }
  if (!persistBody.ok) fail(`persist not ok: ${persistOut}`);
  if (persistBody.repeated) fail('first persist should not be repeated');
  if (persistBody.xpAwarded !== 2) fail(`expected xpAwarded=2, got ${persistBody.xpAwarded}`);

  const usedAfter = Number(
    psql(
      `select count(*) from fight_allowances where account_id='${DEV_ACCOUNT_ID}' and utc_day='${day}' and used_at is not null`,
    ),
  );
  if (usedAfter !== usedBefore + 1) fail(`expected +1 used allowance, ${usedBefore}→${usedAfter}`);

  const retryBattle = psql(`select gen_random_uuid()`);
  const retrySql = `
    select public.persist_fight_result(
      '${DEV_ACCOUNT_ID}',
      '${key}',
      'opp-sir-bot',
      '${retryBattle}',
      '${seed}',
      'combat-v1',
      jsonb_build_object(
        'replayVersion', 1,
        'rulesVersion', 'combat-v1',
        'battleId', '${retryBattle}',
        'seed', '${seed}',
        'inputHash', '${inputHash}',
        'checksum', '${checksum}',
        'fighters', '[]'::jsonb,
        'events', '[]'::jsonb,
        'outcome', jsonb_build_object('winner','player-hero','loser','opp-sir-bot','reason','defeat')
      ),
      jsonb_build_object(
        'characterId','player-hero','hp',30,'weaponKind','sword','weaponPower',3,
        'loadoutVersionId','${atkLoadout}'
      ),
      jsonb_build_object(
        'characterId','opp-sir-bot','hp',34,'weaponKind','sword','weaponPower',3,
        'loadoutVersionId','${defLoadout}'
      ),
      '${day}'::date
    )::text
    from (select set_config('request.jwt.claim.role','service_role',true)) as _auth;
  `;
  const retryOut = psql(retrySql);
  let retryBody;
  try {
    retryBody = JSON.parse(retryOut);
  } catch {
    fail(`persist retry did not return JSON: ${retryOut}`);
  }
  if (!retryBody.ok || !retryBody.repeated) fail(`retry should be repeated: ${retryOut}`);
  if (retryBody.battleId !== battleId) fail('retry must return original battleId');

  const usedRetry = Number(
    psql(
      `select count(*) from fight_allowances where account_id='${DEV_ACCOUNT_ID}' and utc_day='${day}' and used_at is not null`,
    ),
  );
  if (usedRetry !== usedAfter) fail('retry consumed an extra allowance');
  const ledgerAfter = Number(
    psql(`select count(*) from progression_ledger where account_id='${DEV_ACCOUNT_ID}'`),
  );
  if (ledgerAfter !== ledgerBefore + 1) fail('retry awarded duplicate XP');

  const oppXp = Number(
    psql(
      `select count(*) from progression_ledger pl join characters c using (character_id) where c.is_opponent and pl.battle_id='${battleId}'`,
    ),
  );
  if (oppXp !== 0) fail('defender received XP');

  const adminBattles = Number(psql('select count(*) from admin_recent_battles'));
  if (adminBattles < 1) fail('admin_recent_battles empty after persist');
  console.log('SMOKE-OK persist_fight_result idempotent + defender XP guard');

  // F4: drain the battle_completed outbox row written by persist.
  const pendingBefore = Number(
    psql(
      `select count(*) from analytics_outbox where processed_at is null and dead_lettered_at is null`,
    ),
  );
  if (pendingBefore < 1) fail('expected pending outbox row after persist');
  const drainOut = psql(`
    select public.process_analytics_outbox(50, 5)::text
      from (select set_config('request.jwt.claim.role','service_role',true)) as _auth;
  `);
  let drainBody;
  try {
    drainBody = JSON.parse(drainOut);
  } catch {
    fail(`process_analytics_outbox did not return JSON: ${drainOut}`);
  }
  if (!drainBody.ok) fail(`drain not ok: ${drainOut}`);
  if ((drainBody.delivered ?? 0) < 1) fail(`expected delivered>=1, got ${drainOut}`);
  const pendingAfter = Number(
    psql(
      `select count(*) from analytics_outbox where event_id in (
         select event_id from analytics_outbox
          where (payload->>'battleId') = '${battleId}' and event_name = 'battle_completed'
       ) and processed_at is null`,
    ),
  );
  if (pendingAfter !== 0) fail('battle_completed outbox row still pending after drain');

  const cronJobs = Number(psql(`select count(*) from public.admin_list_cron_jobs()`));
  if (cronJobs !== 2) fail(`expected 2 botore cron jobs, got ${cronJobs}`);
  const ensureOut = psql(`
    select public.ensure_fight_allowances(1)::text
      from (select set_config('request.jwt.claim.role','service_role',true)) as _auth;
  `);
  let ensureBody;
  try {
    ensureBody = JSON.parse(ensureOut);
  } catch {
    fail(`ensure_fight_allowances did not return JSON: ${ensureOut}`);
  }
  if (!ensureBody.ok) fail(`ensure_fight_allowances not ok: ${ensureOut}`);
  const statusOut = psql(`select public.outbox_status_snapshot()::text`);
  let statusBody;
  try {
    statusBody = JSON.parse(statusOut);
  } catch {
    fail(`outbox_status_snapshot did not return JSON: ${statusOut}`);
  }
  if (!statusBody.ok) fail(`outbox_status_snapshot not ok: ${statusOut}`);
  console.log('SMOKE-OK F4 outbox drain + pg_cron jobs + allowance ensure');
}

// Edge Functions: best-effort locally; required in CI when REQUIRE_EDGE_FUNCTIONS=1.
// Network failures and HTTP 404 (function not served) may skip unless required;
// any other non-2xx (including 503 degraded/error) fails the smoke run.
try {
  const headers = { apikey: ANON_KEY || 'smoke' };
  if (ANON_KEY) headers.Authorization = `Bearer ${ANON_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/health`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) {
    edgeSkipOrFail('edge health HTTP 404 (serve functions locally to enable)');
  } else if (!res.ok) {
    let detail = '';
    try {
      detail = ` body=${(await res.text()).slice(0, 400)}`;
    } catch {
      /* ignore */
    }
    fail(`edge health HTTP ${res.status}${detail}`);
  } else {
    const body = await res.json();
    if (body.status !== 'ok') fail(`edge health status=${body.status}`);
    if (!body.checks?.database) fail('edge health missing checks.database');
    if (!body.checks?.storage?.atlas_bucket) fail('edge health missing storage.atlas_bucket');
    if (!body.checks?.pg_cron?.present) fail('edge health missing pg_cron.present');
    if (!body.checks?.analytics_outbox) fail('edge health missing analytics_outbox');
    if (!body.checks?.edge_functions?.health?.reachable) {
      fail('edge health missing edge_functions.health.reachable');
    }
    if (!body.checks?.edge_functions?.['combat-v1']?.reachable) {
      fail(`edge health combat-v1 not reachable: ${JSON.stringify(body.checks?.edge_functions)}`);
    }
    console.log('SMOKE-OK edge function /functions/v1/health (DB+cron+outbox+storage+edge)');
  }
} catch (err) {
  // fetch network / timeout only — HTTP error statuses are handled above
  edgeSkipOrFail(`edge health (${err instanceof Error ? err.message : err})`);
}

try {
  // Probe whether combat-v1 is served. 404 → optional skip unless required;
  // any other response means the endpoint is live and must pass with Auth.
  const probe = await fetch(`${SUPABASE_URL}/functions/v1/combat-v1`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY || 'smoke',
      'Content-Type': 'application/json',
      'Idempotency-Key': `smoke-edge-${Date.now()}`,
    },
    body: JSON.stringify({ opponentId: 'opp-sir-bot' }),
    signal: AbortSignal.timeout(5000),
  });
  if (probe.status === 404) {
    edgeSkipOrFail('edge combat-v1 HTTP 404 (serve functions locally to enable)');
  } else {
    const token = await requireDevAccessToken();
    // F3 persist requires Idempotency-Key (probe already sends one; authenticated
    // call must too or Edge returns 400 invalid_idempotency_key).
    const res = await fetch(`${SUPABASE_URL}/functions/v1/combat-v1`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY || 'smoke',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `smoke-edge-auth-${Date.now()}`,
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
  edgeSkipOrFail(`edge combat-v1 (${err instanceof Error ? err.message : err})`);
}

console.log('backend smoke OK');
