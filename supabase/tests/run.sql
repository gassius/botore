-- Database tests: run against a freshly reset local Supabase database.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run.sql
-- Each test raises an exception on failure; a clean run produces TEST-OK lines.
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;
grant execute on all functions in schema tests to authenticated, anon;
--
-- Covers:
--   7. protected gameplay tables reject direct client writes (RLS)
--   5. idempotency constraint prevents duplicate commands
--   append-only rules block UPDATE/DELETE on ledgers
--
-- NOTE on role simulation: RLS is evaluated per role. The tests run as the
-- postgres superuser (bypass). To exercise policies as clients, use
-- `set local role authenticated;` blocks below, which switch to Supabase's
-- JWT-bearing pseudo-role. auth.uid() returns null for it without a JWT,
-- so ownership policies deny everything — exactly what we assert.

create or replace function tests.assert(cond boolean, msg text) returns void as $$
begin
  if not cond then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_count int;
  v_rows bigint;
begin
  -- seed present -----------------------------------------------------------
  select count(*) into v_count from public.characters where is_opponent;
  perform tests.assert(v_count = 3, 'expected three seeded opponents');

  select count(*) into v_count from public.fight_allowances
   where account_id = v_account and utc_day = (now() at time zone 'utc')::date;
  perform tests.assert(v_count = 3, 'expected three allowances today');
  raise notice 'TEST-OK seed fixtures';

  -- RLS: authenticated role cannot write protected tables -------------------
  -- NOTE: with RLS + no matching policy, INSERT raises 42501, while
  -- UPDATE/DELETE simply affect zero rows (nothing visible). Both deny.
  set local role authenticated;

  begin
    insert into public.battles (battle_id, rules_version, seed, end_reason)
    values (gen_random_uuid(), 'combat-v1', 'ab', 'defeat');
    raise exception 'RLS FAIL: insert into battles allowed';
  exception
    when insufficient_privilege then null; -- expected
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;

  update public.progression_ledger set delta_xp = 99;
  get diagnostics v_rows = row_count;
  perform tests.assert(v_rows = 0, 'RLS FAIL: progression_ledger update affected rows');

  begin
    delete from public.fight_allowances;
  exception
    when insufficient_privilege then null; -- no grant at all: denied
    when others then raise;
  end;

  begin
    insert into public.analytics_outbox (event_id, event_name, schema_version, context, payload)
    values (gen_random_uuid(), 'battle_completed', 1, '{}', '{}');
    raise exception 'RLS FAIL: insert analytics_outbox allowed';
  exception
    when others then
      if sqlstate in ('42501', '23514') then null; else raise; end if;
  end;

  update public.admin_audit_log set action = 'tampered';
  get diagnostics v_rows = row_count;
  perform tests.assert(v_rows = 0, 'RLS FAIL: admin_audit_log update affected rows');

  reset role;
  raise notice 'TEST-OK rls denies client writes to protected tables';

  -- Idempotency constraint ---------------------------------------------------
  declare
    v_battle uuid := gen_random_uuid();
  begin
    insert into public.battles (battle_id, rules_version, seed, end_reason)
    values (v_battle, 'combat-v1', repeat('a', 32), 'defeat');

    insert into public.battle_commands (account_id, idempotency_key, battle_id)
    values (v_account, 'test-key-0001', v_battle);

    begin
      insert into public.battle_commands (account_id, idempotency_key, battle_id)
      values (v_account, 'test-key-0001', gen_random_uuid());
      raise exception 'IDEMPOTENCY FAIL: duplicate command accepted';
    exception when unique_violation then
      null; -- expected
    end;
    raise notice 'TEST-OK idempotency unique constraint';

    -- cleanup of this synthetic battle only
    delete from public.battle_commands where battle_id = v_battle;
    delete from public.battles where battle_id = v_battle;
  end;

  -- Append-only ledger rules -------------------------------------------------
  declare
    v_entry uuid;
  begin
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values (v_account, 'player-hero', 2, 'battle')
    returning entry_id into v_entry;

    begin
      update public.progression_ledger set delta_xp = 1 where entry_id = v_entry;
      raise exception 'APPEND-ONLY FAIL: ledger update applied';
    exception when others then
      null; -- DO INSTEAD NOTHING silently ignores; verify value unchanged below
    end;

    select delta_xp into v_count from public.progression_ledger where entry_id = v_entry limit 1;
    perform tests.assert(v_count = 2, 'ledger row was modified');

    delete from public.progression_ledger where entry_id = v_entry;
    select count(*) into v_count from public.progression_ledger where entry_id = v_entry;
    perform tests.assert(v_count = 1, 'ledger delete was applied');
    raise notice 'TEST-OK progression ledger is append-only';

    -- cleanup as table owner (superuser can truncate via rule bypass)
    truncate public.progression_ledger;
  end;

  -- =========================================================================
  -- Bots-as-data (F1)
  -- =========================================================================

  -- Proof catalogue seed ----------------------------------------------------
  select count(*) into v_count from public.parts_catalogue
   where slot_kind = 'chassis' and is_active;
  perform tests.assert(v_count = 1, 'expected 1 active chassis');

  select count(*) into v_count from public.parts_catalogue
   where slot_kind = 'paint' and is_active;
  perform tests.assert(v_count = 2, 'expected 2 active paints');

  select count(*) into v_count from public.parts_catalogue
   where slot_kind = 'weapon' and is_active;
  perform tests.assert(v_count = 3, 'expected 3 active weapons (sword/axe/dagger)');

  select count(*) into v_count from public.current_bot_loadouts;
  perform tests.assert(v_count = 4, 'expected 4 seeded current loadouts');

  select count(*) into v_count from public.inventory_balances
   where account_id = v_account;
  perform tests.assert(v_count = 6, 'expected player to own 6 proof parts');
  raise notice 'TEST-OK bots-as-data seed fixtures';

  -- RLS: clients cannot write catalogue / inventory / loadouts --------------
  set local role authenticated;

  begin
    insert into public.parts_catalogue (
      part_id, slot_kind, display_name, media_key
    ) values ('hack-part', 'chassis', 'Hack', 'parts/hack');
    raise exception 'RLS FAIL: insert into parts_catalogue allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;

  begin
    insert into public.inventory_ledger (account_id, part_id, delta, reason)
    values (v_account, 'chassis-basic', 1, 'grant');
    raise exception 'RLS FAIL: insert into inventory_ledger allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;

  begin
    insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
    values (
      'player-hero',
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","shield":null,"drone":null,"decals":[],"soundTags":[]}'::jsonb,
      'v1'
    );
    raise exception 'RLS FAIL: insert into bot_loadout_versions allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;

  update public.inventory_ledger set delta = 99;
  get diagnostics v_rows = row_count;
  perform tests.assert(v_rows = 0, 'RLS FAIL: inventory_ledger update affected rows');

  reset role;
  raise notice 'TEST-OK rls denies client writes to bots-as-data tables';

  -- Inventory ledger append-only --------------------------------------------
  declare
    v_inv uuid;
    v_qty integer;
  begin
    insert into public.inventory_ledger (account_id, part_id, delta, reason)
    values (v_account, 'chassis-basic', 1, 'grant')
    returning entry_id into v_inv;

    begin
      update public.inventory_ledger set delta = 9 where entry_id = v_inv;
    exception when others then
      null;
    end;

    select delta into v_count from public.inventory_ledger where entry_id = v_inv;
    perform tests.assert(v_count = 1, 'inventory ledger row was modified');

    delete from public.inventory_ledger where entry_id = v_inv;
    select count(*) into v_count from public.inventory_ledger where entry_id = v_inv;
    perform tests.assert(v_count = 1, 'inventory ledger delete was applied');

    -- neutralize the test grant so balances stay reconstructable for later asserts
    insert into public.inventory_ledger (account_id, part_id, delta, reason)
    values (v_account, 'chassis-basic', -1, 'revoke');

    select public.owned_part_quantity(v_account, 'chassis-basic') into v_qty;
    perform tests.assert(v_qty = 1, 'owned quantity should remain 1 after grant+revoke');
    raise notice 'TEST-OK inventory ledger is append-only';
  end;

  -- save_bot_loadout: happy path + ownership + slot mismatch ----------------
  declare
    v_version uuid;
    v_prev uuid;
    v_loadout jsonb;
  begin
    -- System path requires service_role JWT (no anonymous bypass).
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);

    select loadout_version_id into v_prev
      from public.current_bot_loadouts where character_id = 'player-hero';

    v_version := public.save_bot_loadout(
      'player-hero',
      '{"chassis":"chassis-basic","paint":"paint-cobalt","weapon":"weapon-axe"}'::jsonb,
      'v1'
    );
    perform tests.assert(v_version is distinct from v_prev, 'save should append a new version');

    select loadout into v_loadout
      from public.bot_loadout_versions where loadout_version_id = v_version;
    perform tests.assert(v_loadout->>'paint' = 'paint-cobalt', 'paint not persisted');
    perform tests.assert(v_loadout->>'weapon' = 'weapon-axe', 'weapon not persisted');
    perform tests.assert(v_loadout->>'shield' is null, 'shield should be JSON null');
    perform tests.assert(
      v_loadout->'soundTags' ? 'weapon.axe'
      and v_loadout->'soundTags' ? 'chassis.light',
      'sound tags should be derived'
    );
    raise notice 'TEST-OK save_bot_loadout happy path';

    begin
      perform public.save_bot_loadout(
        'player-hero',
        '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","shield":"weapon-axe"}'::jsonb,
        'v1'
      );
      raise exception 'COMPAT FAIL: weapon accepted in shield slot';
    exception
      when others then
        if sqlerrm like 'slot_mismatch%' then null;
        else raise;
        end if;
    end;
    raise notice 'TEST-OK save_bot_loadout rejects slot mismatch';

    begin
      perform public.save_bot_loadout(
        'player-hero',
        '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","soundTags":["ok",1]}'::jsonb,
        'v1'
      );
      raise exception 'SOUNDTAG FAIL: non-string soundTags element accepted';
    exception
      when others then
        if sqlerrm like 'invalid_loadout: soundTags elements must be strings%' then null;
        else raise;
        end if;
    end;
    raise notice 'TEST-OK save_bot_loadout rejects non-string soundTags';

    -- Authenticated non-owner cannot save (simulate JWT sub for other user)
    perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      perform public.save_bot_loadout(
        'player-hero',
        '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword"}'::jsonb,
        'v1'
      );
      raise exception 'AUTH FAIL: non-owner save allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlerrm like 'forbidden%' then null; else raise; end if;
    end;
    raise notice 'TEST-OK save_bot_loadout enforces ownership for JWT callers';

    -- anon must not execute save_bot_loadout (privilege revoke)
    set local role anon;
    begin
      perform public.save_bot_loadout(
        'player-hero',
        '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword"}'::jsonb,
        'v1'
      );
      raise exception 'ANON FAIL: save_bot_loadout allowed for anon';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
    raise notice 'TEST-OK anon cannot execute save_bot_loadout';

    -- authenticated must not execute internal _assert_part_slot
    set local role authenticated;
    begin
      perform public._assert_part_slot(
        'chassis-basic', 'chassis', v_account, false
      );
      raise exception 'INTERNAL FAIL: _assert_part_slot executable by authenticated';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
    raise notice 'TEST-OK authenticated cannot execute _assert_part_slot';

    -- clear JWT leftovers for later asserts
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', '', true);

    -- Opponent loadout is readable via current view; immutable history kept
    select count(*) into v_count from public.bot_loadout_versions
     where character_id = 'player-hero';
    perform tests.assert(v_count >= 2, 'expected immutable history (>=2 versions)');
  end;

  -- Health snapshot + admin views -------------------------------------------
  declare
    v_health jsonb;
  begin
    v_health := public.backend_health_snapshot();
    perform tests.assert(v_health->>'status' = 'ok', 'health status should be ok');
    perform tests.assert(
      (v_health->'checks'->'parts_catalogue'->>'proof_seed_ok')::boolean,
      'health proof_seed_ok'
    );
    perform tests.assert(
      (v_health->'checks'->'storage'->>'atlas_bucket')::boolean,
      'health atlas bucket'
    );
    perform tests.assert(
      (v_health->'checks'->'fight'->>'edge_function') = 'combat-v1',
      'health fight edge_function'
    );
    perform tests.assert(
      (v_health->'checks'->'fight'->>'ready_as_opponent')::integer >= 3,
      'health ready opponents'
    );

    select count(*) into v_count from public.admin_catalogue_summary;
    perform tests.assert(v_count >= 3, 'admin_catalogue_summary missing slots');

    select count(*) into v_count from public.admin_loadout_overview;
    perform tests.assert(v_count >= 4, 'admin_loadout_overview missing characters');

    select count(*) into v_count from public.admin_fight_readiness
     where readiness = 'ready_as_opponent';
    perform tests.assert(v_count = 3, 'admin_fight_readiness opponents');
    raise notice 'TEST-OK backend health snapshot and admin views';
  end;

  -- F2 prepare_fight_context ------------------------------------------------
  -- Note: earlier save_bot_loadout happy-path left player on paint-cobalt + axe.
  declare
    v_ctx jsonb;
    v_weapon text;
  begin
    select loadout->>'weapon' into v_weapon
      from public.current_bot_loadouts where character_id = 'player-hero';

    v_ctx := public.prepare_fight_context(v_account, 'opp-sir-bot');
    perform tests.assert((v_ctx->>'ok')::boolean, 'fight context should be ok');
    perform tests.assert(v_ctx->'attacker'->>'characterId' = 'player-hero', 'attacker id');
    perform tests.assert(v_ctx->'defender'->>'characterId' = 'opp-sir-bot', 'defender id');
    perform tests.assert(
      v_ctx->'attacker'->>'weaponKind' = (
        select weapon_kind from public.parts_catalogue where part_id = v_weapon
      ),
      'attacker weapon from loadout'
    );
    perform tests.assert(
      (v_ctx->>'allowancesRemaining')::integer between 1 and 3,
      'allowances remaining'
    );

    v_ctx := public.prepare_fight_context(v_account, 'no-such-opp');
    perform tests.assert(not (v_ctx->>'ok')::boolean, 'unknown opponent should fail');
    perform tests.assert(v_ctx->>'code' = 'unknown_opponent', 'unknown opponent code');

    v_ctx := public.prepare_fight_context(v_account, 'player-hero');
    perform tests.assert(not (v_ctx->>'ok')::boolean, 'self fight should fail');
    raise notice 'TEST-OK prepare_fight_context eligibility';
  end;
end $$;
