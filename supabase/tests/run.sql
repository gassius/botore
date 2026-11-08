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

  -- F2 prepare_fight_context (authz + eligibility) --------------------------
  -- Note: earlier save_bot_loadout happy-path left player on paint-cobalt + axe.
  declare
    v_ctx jsonb;
    v_weapon text;
    v_other uuid := '11111111-1111-4111-8111-111111111111';
  begin
    select loadout->>'weapon' into v_weapon
      from public.current_bot_loadouts where character_id = 'player-hero';

    -- service_role success path (Edge Function shape)
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);

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
    raise notice 'TEST-OK prepare_fight_context eligibility (service_role)';

    -- Two-account direct-RPC denial: authenticated A cannot query account B
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', v_account::text, true);
    begin
      perform public.prepare_fight_context(v_other, 'opp-sir-bot');
      raise exception 'AUTHZ FAIL: cross-account prepare_fight_context allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlerrm like 'forbidden:%' then null; else raise; end if;
    end;
    raise notice 'TEST-OK prepare_fight_context denies cross-account authenticated RPC';

    -- Matching authenticated uid may call for self
    v_ctx := public.prepare_fight_context(v_account, 'opp-sir-bot');
    perform tests.assert((v_ctx->>'ok')::boolean, 'own-account authenticated fight context');

    -- No JWT / bare role must not call
    perform set_config('request.jwt.claim.role', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    begin
      perform public.prepare_fight_context(v_account, 'opp-sir-bot');
      raise exception 'AUTHZ FAIL: unauthenticated prepare_fight_context allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlerrm like 'forbidden:%' then null; else raise; end if;
    end;
    raise notice 'TEST-OK prepare_fight_context authz gates';
  end;

  -- F3 persist_fight_result: happy / retry / atomic / defender / exhaust / authz
  declare
    v_battle uuid;
    v_battle2 uuid;
    v_seed text := repeat('ab', 16);
    v_checksum text := repeat('cd', 32);
    v_input_hash text := repeat('ef', 32);
    v_replay jsonb;
    v_attacker jsonb;
    v_defender jsonb;
    v_atk_loadout uuid;
    v_def_loadout uuid;
    v_res jsonb;
    v_used int;
    v_ledger int;
    v_outbox int;
    v_opp_ledger int;
    v_allow_before int;
    v_allow_after int;
    v_day date := (now() at time zone 'utc')::date;
    v_key text := 'f3-persist-key-001';
  begin
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);

    select loadout_version_id into v_atk_loadout
      from public.current_bot_loadouts where character_id = 'player-hero';
    select loadout_version_id into v_def_loadout
      from public.current_bot_loadouts where character_id = 'opp-sir-bot';

    v_attacker := jsonb_build_object(
      'characterId', 'player-hero',
      'hp', 30,
      'weaponKind', 'sword',
      'weaponPower', 3,
      'loadoutVersionId', v_atk_loadout
    );
    v_defender := jsonb_build_object(
      'characterId', 'opp-sir-bot',
      'hp', 34,
      'weaponKind', 'sword',
      'weaponPower', 3,
      'loadoutVersionId', v_def_loadout
    );

    v_battle := gen_random_uuid();
    v_replay := jsonb_build_object(
      'replayVersion', 1,
      'rulesVersion', 'combat-v1',
      'battleId', v_battle,
      'seed', v_seed,
      'inputHash', v_input_hash,
      'fighters', jsonb_build_array(
        jsonb_build_object('characterId', 'player-hero', 'hp', 30),
        jsonb_build_object('characterId', 'opp-sir-bot', 'hp', 34)
      ),
      'events', jsonb_build_array(
        jsonb_build_object('type', 'battle_started', 'tick', 0),
        jsonb_build_object(
          'type', 'damage_applied', 'tick', 1,
          'target', 'opp-sir-bot', 'targetHpAfter', 0
        )
      ),
      'outcome', jsonb_build_object(
        'winner', 'player-hero',
        'loser', 'opp-sir-bot',
        'reason', 'defeat'
      ),
      'checksum', v_checksum
    );

    select count(*) into v_allow_before
      from public.fight_allowances
     where account_id = v_account and utc_day = v_day and used_at is null;

    v_res := public.persist_fight_result(
      v_account, v_key, 'opp-sir-bot', v_battle, v_seed, 'combat-v1',
      v_replay, v_attacker, v_defender, v_day
    );
    perform tests.assert((v_res->>'ok')::boolean, 'persist happy path ok');
    perform tests.assert(not (v_res->>'repeated')::boolean, 'persist not repeated');
    perform tests.assert((v_res->>'xpAwarded')::integer = 2, 'win awards 2 XP');
    perform tests.assert(v_res->>'battleId' = v_battle::text, 'battle id echoed');
    perform tests.assert(
      (v_res->>'allowancesRemaining')::integer = v_allow_before - 1,
      'allowance consumed once'
    );

    select count(*) into v_used
      from public.fight_allowances
     where account_id = v_account and utc_day = v_day and used_at is not null;
    perform tests.assert(v_used >= 1, 'at least one allowance marked used');

    select count(*) into v_ledger
      from public.progression_ledger
     where account_id = v_account and battle_id = v_battle and character_id = 'player-hero';
    perform tests.assert(v_ledger = 1, 'one attacker ledger row');

    select count(*) into v_opp_ledger
      from public.progression_ledger pl
      join public.characters c using (character_id)
     where c.is_opponent and pl.battle_id = v_battle;
    perform tests.assert(v_opp_ledger = 0, 'defender must not receive XP');

    select count(*) into v_outbox
      from public.analytics_outbox
     where event_name = 'battle_completed'
       and payload->>'battleId' = v_battle::text;
    perform tests.assert(v_outbox = 1, 'one outbox battle_completed row');

    perform tests.assert(
      exists (
        select 1 from public.battles
         where battle_id = v_battle
           and initiator_account_id = v_account
           and initiator_account_character = 'player-hero'
      ),
      'initiator columns set'
    );
    perform tests.assert(
      exists (
        select 1 from public.battle_participants
         where battle_id = v_battle and side = 'attacker'
           and loadout_version_id = v_atk_loadout
      ),
      'attacker loadout pin stored'
    );
    raise notice 'TEST-OK persist_fight_result happy path (attacker-only XP)';

    -- Idempotent retry: same key must not consume or award again.
    select count(*) into v_allow_before
      from public.fight_allowances
     where account_id = v_account and utc_day = v_day and used_at is null;
    select count(*) into v_ledger
      from public.progression_ledger where account_id = v_account;

    v_battle2 := gen_random_uuid();
    v_res := public.persist_fight_result(
      v_account, v_key, 'opp-sir-bot', v_battle2, v_seed, 'combat-v1',
      jsonb_set(v_replay, '{battleId}', to_jsonb(v_battle2::text)),
      v_attacker, v_defender, v_day
    );
    perform tests.assert((v_res->>'ok')::boolean, 'retry ok');
    perform tests.assert((v_res->>'repeated')::boolean, 'retry repeated');
    perform tests.assert(v_res->>'battleId' = v_battle::text, 'retry returns original battle');
    perform tests.assert((v_res->>'xpAwarded')::integer = 2, 'retry same XP');

    select count(*) into v_allow_after
      from public.fight_allowances
     where account_id = v_account and utc_day = v_day and used_at is null;
    perform tests.assert(v_allow_after = v_allow_before, 'retry did not consume allowance');

    select count(*) into v_used
      from public.progression_ledger where account_id = v_account;
    perform tests.assert(v_used = v_ledger, 'retry did not append ledger');
    raise notice 'TEST-OK persist_fight_result idempotent retry';

    -- Atomic failure: pre-existing battle_id forces insert conflict → no side effects.
    declare
      v_conflict uuid := gen_random_uuid();
      v_key_fail text := 'f3-persist-key-fail';
      v_used_before int;
      v_cmd_before int;
      v_ledger_before int;
    begin
      insert into public.battles (battle_id, rules_version, seed, end_reason)
      values (v_conflict, 'combat-v1', repeat('aa', 16), 'defeat');

      select count(*) into v_used_before
        from public.fight_allowances
       where account_id = v_account and utc_day = v_day and used_at is not null;
      select count(*) into v_cmd_before from public.battle_commands where account_id = v_account;
      select count(*) into v_ledger_before from public.progression_ledger where account_id = v_account;

      begin
        perform public.persist_fight_result(
          v_account, v_key_fail, 'opp-sir-bot', v_conflict, v_seed, 'combat-v1',
          jsonb_set(v_replay, '{battleId}', to_jsonb(v_conflict::text)),
          v_attacker, v_defender, v_day
        );
        raise exception 'ATOMIC FAIL: persist succeeded with conflicting battle_id';
      exception
        when unique_violation then null; -- expected from battles PK
        when others then
          if sqlstate = '23505' then null; else raise; end if;
      end;

      select count(*) into v_used
        from public.fight_allowances
       where account_id = v_account and utc_day = v_day and used_at is not null;
      perform tests.assert(v_used = v_used_before, 'failed persist must not consume allowance');
      select count(*) into v_outbox from public.battle_commands where account_id = v_account;
      perform tests.assert(v_outbox = v_cmd_before, 'failed persist must not insert command');
      select count(*) into v_ledger from public.progression_ledger where account_id = v_account;
      perform tests.assert(v_ledger = v_ledger_before, 'failed persist must not award XP');

      delete from public.battles where battle_id = v_conflict;
      raise notice 'TEST-OK persist_fight_result atomic rollback on failure';
    end;

    -- Concurrency-ish: two different keys consume distinct slots; third ok; fourth exhausts.
    declare
      v_k2 text := 'f3-persist-key-002';
      v_k3 text := 'f3-persist-key-003';
      v_k4 text := 'f3-persist-key-004';
      v_b uuid;
      v_remaining int;
    begin
      -- First fight already consumed one slot. Consume remaining (up to 2 more for today).
      select count(*) into v_remaining
        from public.fight_allowances
       where account_id = v_account and utc_day = v_day and used_at is null;

      if v_remaining >= 1 then
        v_b := gen_random_uuid();
        v_res := public.persist_fight_result(
          v_account, v_k2, 'opp-sir-bot', v_b, v_seed, 'combat-v1',
          jsonb_build_object(
            'replayVersion', 1, 'rulesVersion', 'combat-v1',
            'battleId', v_b, 'seed', v_seed,
            'inputHash', v_input_hash, 'checksum', v_checksum,
            'fighters', '[]'::jsonb, 'events', '[]'::jsonb,
            'outcome', jsonb_build_object(
              'winner', 'opp-sir-bot', 'loser', 'player-hero', 'reason', 'defeat'
            )
          ),
          v_attacker, v_defender, v_day
        );
        perform tests.assert((v_res->>'ok')::boolean, 'second fight ok');
        perform tests.assert((v_res->>'xpAwarded')::integer = 1, 'loss awards 1 XP');
      end if;

      select count(*) into v_remaining
        from public.fight_allowances
       where account_id = v_account and utc_day = v_day and used_at is null;

      if v_remaining >= 1 then
        v_b := gen_random_uuid();
        v_res := public.persist_fight_result(
          v_account, v_k3, 'opp-dex-bot', v_b, v_seed, 'combat-v1',
          jsonb_build_object(
            'replayVersion', 1, 'rulesVersion', 'combat-v1',
            'battleId', v_b, 'seed', v_seed,
            'inputHash', v_input_hash, 'checksum', v_checksum,
            'fighters', '[]'::jsonb, 'events', '[]'::jsonb,
            'outcome', jsonb_build_object(
              'winner', 'player-hero', 'loser', 'opp-dex-bot', 'reason', 'defeat'
            )
          ),
          v_attacker,
          jsonb_build_object(
            'characterId', 'opp-dex-bot',
            'hp', 26,
            'weaponKind', 'dagger',
            'weaponPower', 2,
            'loadoutVersionId', (
              select loadout_version_id from public.current_bot_loadouts
               where character_id = 'opp-dex-bot'
            )
          ),
          v_day
        );
        perform tests.assert((v_res->>'ok')::boolean, 'third fight ok');
      end if;

      v_b := gen_random_uuid();
      v_res := public.persist_fight_result(
        v_account, v_k4, 'opp-sir-bot', v_b, v_seed, 'combat-v1',
        jsonb_build_object(
          'replayVersion', 1, 'rulesVersion', 'combat-v1',
          'battleId', v_b, 'seed', v_seed,
          'inputHash', v_input_hash, 'checksum', v_checksum,
          'fighters', '[]'::jsonb, 'events', '[]'::jsonb,
          'outcome', jsonb_build_object(
            'winner', 'player-hero', 'loser', 'opp-sir-bot', 'reason', 'defeat'
          )
        ),
        v_attacker, v_defender, v_day
      );
      perform tests.assert(not (v_res->>'ok')::boolean, 'fourth fight must fail');
      perform tests.assert(v_res->>'code' = 'allowance_exhausted', 'exhausted code');
      raise notice 'TEST-OK persist_fight_result allowance exhaustion';
    end;

    -- Authz: anon cannot execute; authenticated non-owner forbidden.
    set local role anon;
    begin
      perform public.persist_fight_result(
        v_account, 'f3-anon-denied-01', 'opp-sir-bot', gen_random_uuid(),
        v_seed, 'combat-v1', v_replay, v_attacker, v_defender, v_day
      );
      raise exception 'ANON FAIL: persist_fight_result allowed for anon';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
    raise notice 'TEST-OK anon cannot execute persist_fight_result';

    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
    v_res := public.persist_fight_result(
      v_account, 'f3-owner-denied-01', 'opp-sir-bot', gen_random_uuid(),
      v_seed, 'combat-v1', v_replay, v_attacker, v_defender, v_day
    );
    perform tests.assert(not (v_res->>'ok')::boolean, 'non-owner persist denied');
    perform tests.assert(v_res->>'code' = 'forbidden', 'non-owner forbidden code');
    raise notice 'TEST-OK persist_fight_result enforces ownership';

    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);

    -- Health now reports persist_fight_result
    declare
      v_health jsonb;
    begin
      v_health := public.backend_health_snapshot();
      perform tests.assert(
        v_health->'checks'->'fight'->>'persistence' = 'persist_fight_result',
        'health persistence flag'
      );
      perform tests.assert(
        exists (select 1 from public.admin_recent_battles limit 1),
        'admin_recent_battles readable'
      );
      raise notice 'TEST-OK backend health persistence + admin_recent_battles';
    end;
  end;
end $$;
