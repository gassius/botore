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

    -- Authz: anon / authenticated cannot EXECUTE; body gate rejects non-service JWT.
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

    -- Owning authenticated: execute privilege revoked (direct client RPC denied).
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', v_account::text, true);
    set local role authenticated;
    begin
      perform public.persist_fight_result(
        v_account, 'f3-owner-denied-01', 'opp-sir-bot', gen_random_uuid(),
        v_seed, 'combat-v1', v_replay, v_attacker, v_defender, v_day
      );
      raise exception 'AUTH FAIL: owning authenticated persist_fight_result allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
    raise notice 'TEST-OK owning authenticated cannot execute persist_fight_result';

    -- Defense in depth: JWT authenticated but callable path still forbidden.
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claim.sub', v_account::text, true);
    v_res := public.persist_fight_result(
      v_account, 'f3-jwt-body-denied-01', 'opp-sir-bot', gen_random_uuid(),
      v_seed, 'combat-v1', v_replay, v_attacker, v_defender, v_day
    );
    perform tests.assert(not (v_res->>'ok')::boolean, 'non-service JWT persist denied');
    perform tests.assert(v_res->>'code' = 'forbidden', 'non-service forbidden code');
    raise notice 'TEST-OK persist_fight_result body rejects non-service_role';

    -- service_role lookup of earlier happy-path key (no extra consume).
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);
    declare
      v_lookup jsonb;
    begin
      v_lookup := public.lookup_fight_by_idempotency(v_account, v_key);
      perform tests.assert((v_lookup->>'ok')::boolean, 'lookup ok');
      perform tests.assert((v_lookup->>'found')::boolean, 'lookup found');
      perform tests.assert(v_lookup->>'battleId' = v_battle::text, 'lookup battleId');
      perform tests.assert(
        v_lookup->'loadoutVersionIds'->>'attacker' = v_atk_loadout::text,
        'lookup attacker loadout pin'
      );
      perform tests.assert(
        not (public.lookup_fight_by_idempotency(v_account, 'f3-missing-key-xx')->>'found')::boolean,
        'lookup miss'
      );

      -- Owning authenticated cannot execute lookup either.
      perform set_config('request.jwt.claim.sub', v_account::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      set local role authenticated;
      begin
        perform public.lookup_fight_by_idempotency(v_account, v_key);
        raise exception 'AUTH FAIL: owning authenticated lookup allowed';
      exception
        when insufficient_privilege then null;
        when others then
          if sqlstate = '42501' then null; else raise; end if;
      end;
      reset role;
      perform set_config('request.jwt.claim.role', 'service_role', true);
      perform set_config('request.jwt.claim.sub', '', true);
      raise notice 'TEST-OK service_role lookup; authenticated denied lookup';
    end;

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

    -- Restore today's slots so smoke / Edge / Fastify integration still see
    -- an eligible fighter after this suite intentionally exhausts allowance.
    update public.fight_allowances
       set used_at = null
     where account_id = v_account
       and utc_day = v_day;
    perform tests.assert(
      (
        select count(*) from public.fight_allowances
         where account_id = v_account and utc_day = v_day and used_at is null
      ) = 3,
      'seed allowances restored for post-test smoke'
    );
    raise notice 'TEST-OK fight allowances restored after F3 suite';
  end;
end $$;
-- F4: pg_cron outbox drain + allowance refresh
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_good uuid := gen_random_uuid();
  v_bad uuid := gen_random_uuid();
  v_dead uuid := gen_random_uuid();
  v_result jsonb;
  v_status jsonb;
  v_health jsonb;
  v_count int;
  v_day date := (now() at time zone 'utc')::date;
  v_job_names text[];
begin
  -- Extension + scheduled jobs present ------------------------------------
  perform tests.assert(
    exists (select 1 from pg_extension where extname = 'pg_cron'),
    'pg_cron extension installed'
  );
  select array_agg(jobname order by jobname) into v_job_names
    from cron.job
   where jobname like 'botore-%' and active;
  perform tests.assert(
    v_job_names = array['botore-allowance-refresh', 'botore-outbox-drain'],
    format('expected botore cron jobs, got %s', coalesce(v_job_names::text, 'null'))
  );
  raise notice 'TEST-OK pg_cron extension + botore jobs scheduled';

  -- Happy path: valid battle_completed drains to processed ----------------
  insert into public.analytics_outbox (
    event_id, event_name, schema_version, context, payload
  ) values (
    v_good,
    'battle_completed',
    1,
    jsonb_build_object('accountId', v_account),
    jsonb_build_object('battleId', gen_random_uuid(), 'won', true, 'xpAwarded', 2)
  );

  select public.process_analytics_outbox(50, 5) into v_result;
  perform tests.assert((v_result->>'ok')::boolean, 'drain ok');
  perform tests.assert((v_result->>'delivered')::int >= 1, 'delivered at least one');
  perform tests.assert(
    (select processed_at is not null from public.analytics_outbox where event_id = v_good),
    'good row processed'
  );
  perform tests.assert(
    (select last_error is null from public.analytics_outbox where event_id = v_good),
    'good row clears last_error'
  );

  -- Idempotent re-drain: already processed not claimed again --------------
  select public.process_analytics_outbox(50, 5) into v_result;
  perform tests.assert((v_result->>'claimed')::int = 0
    or not exists (
      select 1 from public.analytics_outbox
       where event_id = v_good and processed_at is null
    ),
    'processed row not re-claimed'
  );
  select count(*) into v_count
    from public.admin_audit_log
   where action = 'outbox_delivered'
     and details->>'eventId' = v_good::text;
  perform tests.assert(v_count = 1, 'exactly one delivery audit for good event');
  raise notice 'TEST-OK outbox happy path + idempotent re-drain';

  -- Validation failure stays visible; retries then dead-letter ------------
  insert into public.analytics_outbox (
    event_id, event_name, schema_version, context, payload
  ) values (
    v_bad,
    'battle_completed',
    1,
    jsonb_build_object('accountId', v_account),
    jsonb_build_object('won', true) -- missing battleId + xpAwarded
  );

  select public.process_analytics_outbox(50, 5) into v_result;
  perform tests.assert((v_result->>'failed')::int >= 1, 'invalid row failed');
  perform tests.assert(
    (select processed_at is null and last_error is not null
       from public.analytics_outbox where event_id = v_bad),
    'failed row visible with last_error'
  );
  perform tests.assert(
    exists (select 1 from public.admin_outbox_failures where event_id = v_bad),
    'admin_outbox_failures lists failing row'
  );

  -- Drive to dead letter with max_attempts=1 on a fresh bad row
  insert into public.analytics_outbox (
    event_id, event_name, schema_version, context, payload
  ) values (
    v_dead,
    'not_a_real_event',
    1,
    '{}'::jsonb,
    '{}'::jsonb
  );
  select public.process_analytics_outbox(50, 1) into v_result;
  perform tests.assert((v_result->>'deadLettered')::int >= 1, 'dead lettered');
  perform tests.assert(
    (select dead_lettered_at is not null and processed_at is null
       from public.analytics_outbox where event_id = v_dead),
    'dead-lettered row not lost (still unprocessed)'
  );

  -- Dead-lettered rows are not reclaimed on subsequent drains
  select public.process_analytics_outbox(50, 5) into v_result;
  perform tests.assert(
    (select dead_lettered_at is not null from public.analytics_outbox where event_id = v_dead),
    'dead letter remains after drain'
  );

  -- retry_outbox_event requeues dead letter -------------------------------
  select public.retry_outbox_event(v_dead) into v_result;
  perform tests.assert((v_result->>'ok')::boolean, 'retry ok');
  perform tests.assert(
    (select dead_lettered_at is null and last_error is null
       from public.analytics_outbox where event_id = v_dead),
    'retry clears dead_lettered_at'
  );
  -- still invalid → fails again (not lost)
  select public.process_analytics_outbox(50, 5) into v_result;
  perform tests.assert(
    (select last_error is not null from public.analytics_outbox where event_id = v_dead),
    'retried invalid row fails visibly again'
  );
  raise notice 'TEST-OK outbox failure visibility + dead letter + retry';

  -- Authz: authenticated cannot drain / retry / ensure --------------------
  begin
    perform set_config('request.jwt.claim.sub', v_account::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    begin
      perform public.process_analytics_outbox(10, 5);
      raise exception 'AUTH FAIL: authenticated process_analytics_outbox allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    begin
      perform public.retry_outbox_event(v_dead);
      raise exception 'AUTH FAIL: authenticated retry_outbox_event allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    begin
      perform public.ensure_fight_allowances(1);
      raise exception 'AUTH FAIL: authenticated ensure_fight_allowances allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end;
  raise notice 'TEST-OK authenticated denied outbox/allowance RPCs';

  -- ensure_fight_allowances idempotent + creates horizon day --------------
  delete from public.fight_allowances
   where account_id = v_account
     and utc_day = v_day + 2;
  select public.ensure_fight_allowances(2) into v_result;
  perform tests.assert((v_result->>'ok')::boolean, 'ensure allowances ok');
  perform tests.assert(
    (select count(*) from public.fight_allowances
      where account_id = v_account and utc_day = v_day + 2) = 3,
    'horizon day +2 has 3 slots'
  );
  select public.ensure_fight_allowances(2) into v_result;
  perform tests.assert((v_result->>'inserted')::int = 0, 'second ensure inserts 0');
  raise notice 'TEST-OK ensure_fight_allowances idempotent';

  -- Admin / health APIs ---------------------------------------------------
  select public.outbox_status_snapshot() into v_status;
  perform tests.assert((v_status->>'ok')::boolean, 'outbox_status_snapshot ok');
  perform tests.assert(
    jsonb_typeof(v_status->'cronJobs') = 'array'
      and jsonb_array_length(v_status->'cronJobs') = 2,
    'outbox_status_snapshot lists 2 cron jobs'
  );
  perform tests.assert(
    exists (select 1 from public.admin_list_cron_jobs() where jobname = 'botore-outbox-drain'),
    'admin_list_cron_jobs returns outbox drain'
  );
  perform tests.assert(
    exists (select 1 from public.admin_outbox_overview),
    'admin_outbox_overview readable'
  );

  select public.backend_health_snapshot() into v_health;
  perform tests.assert(
    (v_health->'checks'->'pg_cron'->>'present')::boolean,
    'health pg_cron.present'
  );
  perform tests.assert(
    (v_health->'checks'->'pg_cron'->>'outbox_drain_scheduled')::boolean,
    'health outbox_drain_scheduled'
  );
  perform tests.assert(
    (v_health->'checks'->'pg_cron'->>'allowance_refresh_scheduled')::boolean,
    'health allowance_refresh_scheduled'
  );
  perform tests.assert(
    (v_health->'checks'->'pg_cron'->>'active_botore_jobs')::int = 2,
    'health active_botore_jobs=2'
  );
  perform tests.assert(
    v_health->'checks'->'analytics_outbox'->>'processor' = 'process_analytics_outbox',
    'health outbox processor flag'
  );
  -- Overall status=ok when proof seed + loadouts + atlas pack are present (full db:reset).
  if (v_health->'checks'->'parts_catalogue'->>'proof_seed_ok')::boolean
     and coalesce((v_health->'checks'->'bot_loadouts'->>'current_count')::int, 0) >= 1
     and coalesce((v_health->'checks'->'fight'->>'ready_as_opponent')::int, 0) >= 1
     and coalesce((v_health->'checks'->'storage'->>'proof_pack_ok')::boolean, false) then
    perform tests.assert(v_health->>'status' = 'ok', 'health status ok after F4+F5');
  end if;
  raise notice 'TEST-OK F4 admin APIs + backend_health_snapshot';
end $$;

-- =========================================================================
-- Atlas media packs (F5)
-- Requires scripts/seed-atlas-storage.mjs to have published v1 with real
-- Storage payloads before this suite runs (see infra/db-reset.sh / CI).
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_count int;
  v_manifest jsonb;
  v_health jsonb;
  v_version_id uuid;
  v_battle uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_atlas text;
  v_obj_name text;
  v_draft text := 'v77';
  v_draft_b text := 'v78';
begin
  -- Published v1 proof pack (bootstrap must have uploaded + published) ------
  select count(*) into v_count from public.atlas_versions where version = 'v1' and status = 'published';
  perform tests.assert(v_count = 1, 'expected published atlas v1 (run seed-atlas-storage.mjs)');

  select count(*) into v_count from public.atlas_manifest_entries where version = 'v1';
  perform tests.assert(v_count >= 20, format('expected >=20 manifest entries, got %s', v_count));

  perform tests.assert(
    coalesce(array_length(public.atlas_missing_storage_paths('v1'), 1), 0) = 0,
    'v1 has no missing Storage paths'
  );

  select count(*) into v_count
    from storage.objects
   where bucket_id = 'atlas' and name like 'v1/%';
  perform tests.assert(v_count >= 20, format('expected >=20 storage objects for v1, got %s', v_count));

  select count(distinct part_id) into v_count
    from public.atlas_manifest_entries
   where version = 'v1'
     and part_id in (
       'chassis-basic','paint-crimson','paint-cobalt',
       'weapon-sword','weapon-axe','weapon-dagger'
     );
  perform tests.assert(v_count = 6, 'manifest maps all 6 proof catalogue parts');

  perform tests.assert(
    exists (
      select 1 from public.atlas_manifest_entries
       where version = 'v1' and role = 'arena' and path like 'arenas/quiet/%'
    ),
    'quiet arena present'
  );
  perform tests.assert(
    (
      select count(*) from public.atlas_manifest_entries
       where version = 'v1' and role = 'fx'
         and path in ('fx/hit.png','fx/dodge.png','fx/defeat.png')
    ) = 3,
    'hit/dodge/defeat FX present'
  );
  perform tests.assert(
    exists (
      select 1 from public.atlas_manifest_entries
       where version = 'v1' and kind = 'audio' and role = 'hit' and path like 'base/%'
    ),
    'base pack hit fallback present'
  );

  perform tests.assert(
    (select budgets_final from public.atlas_versions where version = 'v1') = false,
    'budgets_final must stay false (not approved)'
  );

  select public.get_atlas_manifest('v1') into v_manifest;
  perform tests.assert((v_manifest->>'ok')::boolean, 'get_atlas_manifest ok');
  perform tests.assert(v_manifest->>'version' = 'v1', 'manifest version v1');
  perform tests.assert(v_manifest->>'bucket' = 'atlas', 'manifest bucket atlas');
  perform tests.assert(
    jsonb_typeof(v_manifest->'entries') = 'array'
      and jsonb_array_length(v_manifest->'entries') >= 20,
    'manifest entries array populated'
  );
  raise notice 'TEST-OK atlas v1 proof pack + get_atlas_manifest';

  -- Publish rejects missing Storage objects --------------------------------
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
  values (v_draft, 'draft', null, jsonb_build_object('version', v_draft), false, 'missing-objects fixture');
  insert into public.atlas_manifest_entries (version, asset_key, kind, part_id, role, path)
  values (v_draft, 'missing.root', 'manifest', null, 'manifest', 'manifest.json');
  begin
    perform public.publish_atlas_version(v_draft);
    raise exception 'PUBLISH FAIL: published draft with missing Storage objects';
  exception
    when others then
      if sqlstate = '22023' and sqlerrm like 'atlas_publish_missing_objects%' then null;
      else raise;
      end if;
  end;
  raise notice 'TEST-OK publish rejects missing Storage objects';

  -- Immutability: published version cannot change (strict SQLSTATE) --------
  begin
    update public.atlas_versions set notes = 'hacked' where version = 'v1';
    raise exception 'IMMUTABILITY FAIL: updated published atlas_versions';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_version_immutable%' then null;
      else raise;
      end if;
  end;

  begin
    insert into public.atlas_manifest_entries (
      version, asset_key, kind, part_id, role, path
    ) values ('v1', 'hack.entry', 'image', null, 'fx', 'fx/hack.png');
    raise exception 'IMMUTABILITY FAIL: inserted into published manifest';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_manifest_immutable%' then null;
      else raise;
      end if;
  end;

  -- Source-side reparent from published → draft must fail
  insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
  values (v_draft_b, 'draft', null, jsonb_build_object('version', v_draft_b), false, 'reparent dest')
  on conflict do nothing;
  begin
    update public.atlas_manifest_entries
       set version = v_draft_b, asset_key = 'hack.moved', path = 'fx/moved.png'
     where version = 'v1' and asset_key = 'manifest.root';
    raise exception 'IMMUTABILITY FAIL: reparented published manifest entry';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_manifest_immutable%' then null;
      else raise;
      end if;
  end;

  select o.name into v_obj_name
    from storage.objects o
   where o.bucket_id = 'atlas' and o.name like 'v1/%'
   order by o.name
   limit 1;
  perform tests.assert(v_obj_name is not null, 'expected at least one v1 storage object fixture');

  begin
    update storage.objects
       set metadata = coalesce(metadata, '{}'::jsonb) || '{"hacked":true}'::jsonb
     where bucket_id = 'atlas' and name = v_obj_name;
    raise exception 'IMMUTABILITY FAIL: updated published storage object';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_storage_immutable%' then null;
      else raise;
      end if;
  end;

  begin
    update storage.objects
       set name = replace(v_obj_name, 'v1/', v_draft_b || '/')
     where bucket_id = 'atlas' and name = v_obj_name;
    raise exception 'IMMUTABILITY FAIL: renamed published storage object off v1';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_storage_immutable%' then null;
      else raise;
      end if;
  end;

  begin
    delete from storage.objects where bucket_id = 'atlas' and name = v_obj_name;
    raise exception 'IMMUTABILITY FAIL: deleted published storage object';
  exception
    when others then
      -- Prefer our published-prefix guard; Storage also installs
      -- storage.protect_delete() which blocks ALL SQL deletes platform-wide.
      if (sqlstate = '55000' and sqlerrm like 'atlas_storage_immutable%')
         or sqlerrm like 'Direct deletion from storage tables is not allowed%'
      then null;
      else raise;
      end if;
  end;
  raise notice 'TEST-OK published atlas immutability (incl. source reparent/rename)';

  -- RLS: clients cannot write atlas tables --------------------------------
  set local role authenticated;
  begin
    insert into public.atlas_versions (version, status, published_at, manifest, budgets_final)
    values ('v9', 'draft', null, '{}'::jsonb, false);
    raise exception 'RLS FAIL: insert into atlas_versions allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.publish_atlas_version('v1');
    raise exception 'AUTH FAIL: authenticated publish_atlas_version allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;
  raise notice 'TEST-OK atlas RLS + publish authz';

  -- Fights pin atlas_version on participants ------------------------------
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select loadout_version_id into v_version_id
    from public.current_bot_loadouts where character_id = 'player-hero';

  insert into public.battles (
    battle_id, rules_version, seed, end_reason, initiator_account_id,
    initiator_account_character, winner_id, utc_day
  ) values (
    v_battle, 'combat-v1', 'f5seedf5seedf5seedf5seedf5seedf5se', 'defeat',
    v_account, 'player-hero', 'player-hero', (now() at time zone 'utc')::date
  );

  insert into public.battle_participants (
    battle_id, character_id, side, hp_before, hp_after,
    weapon_kind, weapon_power, loadout_version_id
  ) values (
    v_battle, 'player-hero', 'attacker', 10, 10, 'sword', 3, v_version_id
  );

  select atlas_version into v_atlas
    from public.battle_participants
   where battle_id = v_battle and character_id = 'player-hero';
  perform tests.assert(v_atlas = 'v1', format('fight pinned atlas_version=v1, got %s', v_atlas));

  perform tests.assert(
    exists (
      select 1 from public.admin_recent_battles
       where battle_id = v_battle and attacker_atlas_version = 'v1'
    ),
    'admin_recent_battles exposes attacker_atlas_version'
  );

  delete from public.battle_participants where battle_id = v_battle;
  delete from public.battles where battle_id = v_battle;

  -- A later non-proof publish must not clear proof_pack_ok / status=ok.
  -- (CI race fixture also leaves a later publish; this covers local runs.)
  -- Version must match ^v[0-9]+$ (atlas_versions_version_check).
  insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
  values (
    'v900001', 'draft', null,
    jsonb_build_object('version', 'v900001'), false, 'health isolation fixture'
  );
  insert into public.atlas_manifest_entries (version, asset_key, kind, part_id, role, path)
  values ('v900001', 'fixture.root', 'manifest', null, 'manifest', 'manifest.json');
  insert into storage.objects (bucket_id, name, metadata)
  values ('atlas', 'v900001/manifest.json', '{"fixture":true}'::jsonb);
  perform public.publish_atlas_version('v900001');

  select public.backend_health_snapshot() into v_health;
  perform tests.assert(
    (v_health->'checks'->'storage'->>'atlas_bucket')::boolean,
    'health atlas_bucket'
  );
  perform tests.assert(
    (v_health->'checks'->'storage'->>'proof_pack_ok')::boolean,
    'health proof_pack_ok after later publish'
  );
  perform tests.assert(
    v_health->>'status' = 'ok',
    'health status ok after later non-proof publish'
  );
  perform tests.assert(
    v_health->'checks'->'storage'->>'proof_version' = 'v1',
    'health proof_version pinned to v1'
  );
  perform tests.assert(
    v_health->'checks'->'storage'->>'latest_version' = 'v900001',
    'health latest_version reflects newest publish'
  );
  perform tests.assert(
    (v_health->'checks'->'storage'->>'budgets_final')::boolean = false,
    'health budgets_final false'
  );
  perform tests.assert(
    exists (select 1 from public.admin_atlas_overview where version = 'v1' and status = 'published'),
    'admin_atlas_overview lists v1'
  );
  raise notice 'TEST-OK F5 fight media refs + health atlas flags';
end $$;

-- =========================================================================
-- B2: admin dashboard read APIs (views + snapshot) — no UI
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_snap jsonb;
  v_stats record;
  v_count int;
begin
  perform tests.assert(
    exists (
      select 1 from public.admin_players_overview
       where account_id = v_account
         and character_id = 'player-hero'
    ),
    'admin_players_overview lists seed player'
  );

  select count(*) into v_count from public.admin_bots_overview;
  perform tests.assert(v_count >= 4, 'admin_bots_overview has player + opponents');

  perform tests.assert(
    exists (
      select 1 from public.admin_bots_overview
       where character_id = 'player-hero'
         and readiness is not null
         and loadout_version_id is not null
    ),
    'admin_bots_overview exposes readiness + loadout'
  );

  select * into v_stats from public.admin_fight_stats;
  perform tests.assert(v_stats.player_count >= 1, 'admin_fight_stats player_count');
  perform tests.assert(v_stats.opponent_bot_count = 3, 'admin_fight_stats opponent_bot_count');
  perform tests.assert(v_stats.total_battles >= 0, 'admin_fight_stats total_battles');

  select count(*) into v_count from public.admin_daily_active_accounts;
  perform tests.assert(v_count = 30, 'admin_daily_active_accounts is 30-day window');

  perform tests.assert(
    exists (select 1 from public.admin_atlas_overview where version = 'v1'),
    'admin_atlas_overview readable for pack versions'
  );

  perform tests.assert(
    exists (select 1 from public.admin_list_cron_jobs() where jobname = 'botore-outbox-drain'),
    'admin_list_cron_jobs still lists outbox drain'
  );

  -- Runs may be empty before cron fires; RPC must still succeed.
  perform tests.assert(
    (select count(*) >= 0 from public.admin_list_cron_job_runs(10)),
    'admin_list_cron_job_runs callable'
  );

  select public.admin_dashboard_snapshot() into v_snap;
  perform tests.assert((v_snap->>'ok')::boolean, 'admin_dashboard_snapshot ok');
  perform tests.assert(v_snap->>'service' = 'admin-dashboard', 'snapshot service tag');
  perform tests.assert(jsonb_typeof(v_snap->'health') = 'object', 'snapshot health object');
  perform tests.assert(jsonb_typeof(v_snap->'outbox') = 'object', 'snapshot outbox object');
  perform tests.assert(jsonb_typeof(v_snap->'fightStats') = 'object', 'snapshot fightStats object');
  perform tests.assert(jsonb_typeof(v_snap->'players') = 'array', 'snapshot players array');
  perform tests.assert(jsonb_typeof(v_snap->'bots') = 'array', 'snapshot bots array');
  perform tests.assert(jsonb_typeof(v_snap->'atlasVersions') = 'array', 'snapshot atlasVersions array');
  perform tests.assert(jsonb_typeof(v_snap->'cronJobs') = 'array', 'snapshot cronJobs array');
  perform tests.assert(jsonb_typeof(v_snap->'cronJobRuns') = 'array', 'snapshot cronJobRuns array');
  perform tests.assert(jsonb_typeof(v_snap->'dailyActiveAccounts') = 'array', 'snapshot dailyActiveAccounts array');
  perform tests.assert(jsonb_typeof(v_snap->'recentBattles') = 'array', 'snapshot recentBattles array');
  perform tests.assert(
    jsonb_array_length(v_snap->'players') >= 1,
    'snapshot includes seed player'
  );
  perform tests.assert(
    jsonb_array_length(v_snap->'bots') >= 4,
    'snapshot includes bots'
  );
  perform tests.assert(
    jsonb_array_length(v_snap->'cronJobs') = 2,
    'snapshot lists 2 cron jobs'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_snap->'atlasVersions') a
       where a->>'version' = 'v1'
    ),
    'snapshot includes atlas v1'
  );

  -- Authz: client JWT roles must not execute SECURITY DEFINER admin RPCs.
  -- (Grant-only gate; these functions bypass RLS when callable.)
  begin
    perform set_config('request.jwt.claim.role', 'anon', true);
    set local role anon;
    begin
      perform public.admin_dashboard_snapshot();
      raise exception 'AUTH FAIL: anon admin_dashboard_snapshot allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    begin
      perform public.admin_list_cron_job_runs(5);
      raise exception 'AUTH FAIL: anon admin_list_cron_job_runs allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
  end;

  begin
    perform set_config('request.jwt.claim.sub', v_account::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
    begin
      perform public.admin_dashboard_snapshot();
      raise exception 'AUTH FAIL: authenticated admin_dashboard_snapshot allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    begin
      perform public.admin_list_cron_job_runs(5);
      raise exception 'AUTH FAIL: authenticated admin_list_cron_job_runs allowed';
    exception
      when insufficient_privilege then null;
      when others then
        if sqlstate = '42501' then null; else raise; end if;
    end;
    reset role;
    perform set_config('request.jwt.claim.role', 'service_role', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end;

  raise notice 'TEST-OK B2 admin dashboard APIs';
end $$;
-- =========================================================================
-- SEC: catalog-wide admin privilege invariant (order-independent)
-- =========================================================================
-- Fails if ANY public.admin_% view or admin/health definer function is
-- selectable/executable by anon/authenticated — regardless of which
-- migrations (0017/0018/0019…) have landed. Also asserts service_role can.
do $$
declare
  r record;
  v_count int := 0;
  v_fn_count int := 0;
  v_json jsonb;
  v_health jsonb;
  v_outbox jsonb;
  v_dash jsonb;
  v_cron_ok boolean := false;
  v_runs_ok boolean := false;
  v_dash_present boolean := false;
  v_runs_present boolean := false;
begin
  -- Catalog: every public.admin_% *view* must deny client SELECT ----------
  -- (tables like admin_audit_log are ledgers, not reporting views)
  for r in
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and c.relname like 'admin_%'
     order by c.relname
  loop
    v_count := v_count + 1;
    perform tests.assert(
      not has_table_privilege('anon', r.oid, 'SELECT'),
      format('anon must not SELECT %s', r.relname)
    );
    perform tests.assert(
      not has_table_privilege('authenticated', r.oid, 'SELECT'),
      format('authenticated must not SELECT %s', r.relname)
    );
    perform tests.assert(
      has_table_privilege('service_role', r.oid, 'SELECT'),
      format('service_role must SELECT %s', r.relname)
    );
  end loop;
  perform tests.assert(v_count >= 7, format('expected >=7 admin_%% views, got %s', v_count));

  -- Catalog: admin/health functions must deny client EXECUTE ---------------
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (
         p.proname like 'admin_%'
         or p.proname in ('backend_health_snapshot', 'outbox_status_snapshot')
       )
     order by p.proname, 3
  loop
    v_fn_count := v_fn_count + 1;
    perform tests.assert(
      not has_function_privilege('anon', r.oid, 'EXECUTE'),
      format('anon must not EXECUTE %s(%s)', r.proname, r.args)
    );
    perform tests.assert(
      not has_function_privilege('authenticated', r.oid, 'EXECUTE'),
      format('authenticated must not EXECUTE %s(%s)', r.proname, r.args)
    );
    perform tests.assert(
      has_function_privilege('service_role', r.oid, 'EXECUTE'),
      format('service_role must EXECUTE %s(%s)', r.proname, r.args)
    );
  end loop;
  perform tests.assert(
    v_fn_count >= 3,
    format('expected >=3 admin/health functions, got %s', v_fn_count)
  );

  -- service_role positive: live-execute DEFINER RPCs only -----------------
  -- Do NOT SELECT security_invoker admin views as service_role — that would
  -- require SELECT on player base tables (e.g. parts_catalogue). View grants
  -- are already asserted via has_table_privilege above. Dashboard uses the
  -- owner/reporting DB URL for invoker views.
  -- Capture results under service_role, then assert as owner (tests schema
  -- is not granted to service_role).
  v_dash_present := to_regprocedure('public.admin_dashboard_snapshot()') is not null;
  v_runs_present := to_regprocedure('public.admin_list_cron_job_runs(integer)') is not null;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role service_role;

  select public.backend_health_snapshot() into v_health;
  select public.outbox_status_snapshot() into v_outbox;
  select exists (select 1 from public.admin_list_cron_jobs() limit 1) into v_cron_ok;

  if v_dash_present then
    select public.admin_dashboard_snapshot() into v_dash;
  end if;
  -- Runs may be empty before cron fires (fresh CI); RPC must still succeed.
  -- Mirror B2: count(*) >= 0 proves EXECUTE without requiring history rows.
  if v_runs_present then
    select (count(*) >= 0) into v_runs_ok from public.admin_list_cron_job_runs(5);
  else
    v_runs_ok := true;
  end if;

  reset role;
  perform set_config('request.jwt.claim.role', 'service_role', true);

  perform tests.assert(v_health ? 'status', 'service_role backend_health_snapshot');
  perform tests.assert((v_outbox->>'ok')::boolean, 'service_role outbox_status_snapshot');
  perform tests.assert(v_cron_ok, 'service_role admin_list_cron_jobs');
  if v_dash_present then
    perform tests.assert((v_dash->>'ok')::boolean, 'service_role admin_dashboard_snapshot');
  end if;
  perform tests.assert(v_runs_ok, 'service_role admin_list_cron_job_runs (optional)');

  raise notice 'TEST-OK SEC admin grant lockdown (catalog privileges)';
end $$;

-- =========================================================================
-- B: sanctioned authenticated client read RPCs (0020)
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_other uuid := '11111111-1111-4111-8111-111111111111';
  v_res jsonb;
  v_count int;
  v_day text;
begin
  -- Privileges: authenticated EXECUTE only; anon + service_role denied
  perform tests.assert(
    has_function_privilege('authenticated', 'public.get_owned_character()', 'EXECUTE'),
    'authenticated EXECUTE get_owned_character'
  );
  perform tests.assert(
    has_function_privilege('authenticated', 'public.list_opponent_roster()', 'EXECUTE'),
    'authenticated EXECUTE list_opponent_roster'
  );
  perform tests.assert(
    has_function_privilege('authenticated', 'public.get_fight_allowance_summary()', 'EXECUTE'),
    'authenticated EXECUTE get_fight_allowance_summary'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.get_owned_character()', 'EXECUTE'),
    'anon must not EXECUTE get_owned_character'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.list_opponent_roster()', 'EXECUTE'),
    'anon must not EXECUTE list_opponent_roster'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.get_fight_allowance_summary()', 'EXECUTE'),
    'anon must not EXECUTE get_fight_allowance_summary'
  );
  perform tests.assert(
    not has_function_privilege('service_role', 'public.get_owned_character()', 'EXECUTE'),
    'service_role must not EXECUTE get_owned_character'
  );
  perform tests.assert(
    not has_function_privilege('service_role', 'public.list_opponent_roster()', 'EXECUTE'),
    'service_role must not EXECUTE list_opponent_roster'
  );
  perform tests.assert(
    not has_function_privilege('service_role', 'public.get_fight_allowance_summary()', 'EXECUTE'),
    'service_role must not EXECUTE get_fight_allowance_summary'
  );
  raise notice 'TEST-OK B client-read RPC privileges';

  -- Happy path as owning authenticated
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'get_owned_character ok');
  perform tests.assert(v_res->>'characterId' = 'player-hero', 'owned characterId');
  perform tests.assert(v_res->>'displayName' = 'Hero', 'owned displayName');

  v_res := public.list_opponent_roster();
  perform tests.assert((v_res->>'ok')::boolean, 'list_opponent_roster ok');
  perform tests.assert(jsonb_typeof(v_res->'opponents') = 'array', 'opponents array');
  select count(*)::int into v_count
    from jsonb_array_elements(v_res->'opponents') o;
  perform tests.assert(v_count = 3, format('expected 3 opponents, got %s', v_count));
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'opponents') o
       where o->>'characterId' = 'opp-sir-bot'
         and o->>'displayName' = 'Sir Bot'
    ),
    'opp-sir-bot in roster'
  );

  v_res := public.get_fight_allowance_summary();
  perform tests.assert((v_res->>'ok')::boolean, 'get_fight_allowance_summary ok');
  v_day := (now() at time zone 'utc')::date::text;
  perform tests.assert(v_res->>'utcDay' = v_day, 'utcDay is server UTC today');
  perform tests.assert(
    (v_res->>'allowancesRemaining')::integer between 0 and 3,
    'allowancesRemaining in 0..3'
  );
  reset role;
  raise notice 'TEST-OK B client-read RPC happy path (authenticated)';

  -- Negative: cross-account isolation — other account's unused slots are invisible
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_other,
    'other-player@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id) values (v_other) on conflict do nothing;
  insert into public.fight_allowances (account_id, utc_day, slot_index)
  select v_other, (now() at time zone 'utc')::date, s
    from generate_series(1, 3) as s
  on conflict do nothing;
  -- Exhaust caller's slots so a leak of v_other's 3 would inflate remaining.
  update public.fight_allowances
     set used_at = now()
   where account_id = v_account
     and utc_day = (now() at time zone 'utc')::date;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_fight_allowance_summary();
  perform tests.assert((v_res->>'ok')::boolean, 'exhausted caller still ok');
  perform tests.assert(
    (v_res->>'allowancesRemaining')::integer = 0,
    'cross-account: must not see other account allowances'
  );
  reset role;
  -- Restore caller allowances for later suites.
  update public.fight_allowances
     set used_at = null
   where account_id = v_account
     and utc_day = (now() at time zone 'utc')::date;
  raise notice 'TEST-OK B get_fight_allowance_summary denies cross-account';

  -- Negative: anon cannot execute any of the three RPCs
  set local role anon;
  begin
    perform public.get_owned_character();
    raise exception 'ANON FAIL: get_owned_character allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.list_opponent_roster();
    raise exception 'ANON FAIL: list_opponent_roster allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.get_fight_allowance_summary();
    raise exception 'ANON FAIL: get_fight_allowance_summary allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;
  raise notice 'TEST-OK B client-read RPCs deny anon';

  -- Negative: service_role cannot EXECUTE (authenticated-only grants)
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role service_role;
  begin
    perform public.get_owned_character();
    raise exception 'SERVICE FAIL: get_owned_character allowed for service_role';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.list_opponent_roster();
    raise exception 'SERVICE FAIL: list_opponent_roster allowed for service_role';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.get_fight_allowance_summary();
    raise exception 'SERVICE FAIL: get_fight_allowance_summary allowed for service_role';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;
  raise notice 'TEST-OK B client-read RPCs deny service_role EXECUTE';

  -- Negative: unauthenticated JWT role denied (body gate even if EXECUTE present)
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.get_owned_character();
    raise exception 'AUTHZ FAIL: unauthenticated get_owned_character allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.list_opponent_roster();
    raise exception 'AUTHZ FAIL: unauthenticated list_opponent_roster allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.get_fight_allowance_summary();
    raise exception 'AUTHZ FAIL: unauthenticated get_fight_allowance_summary allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then null; else raise; end if;
  end;
  raise notice 'TEST-OK B client-read RPC authz gates';

  -- =========================================================================
  -- 0021: loadout RLS helpers (no characters table GRANT)
  -- =========================================================================
  perform tests.assert(
    has_function_privilege('authenticated', 'public.bot_character_owned_by_caller(text)', 'EXECUTE'),
    'authenticated EXECUTE bot_character_owned_by_caller'
  );
  perform tests.assert(
    has_function_privilege('authenticated', 'public.bot_character_is_system_opponent(text)', 'EXECUTE'),
    'authenticated EXECUTE bot_character_is_system_opponent'
  );
  perform tests.assert(
    has_function_privilege('anon', 'public.bot_character_is_system_opponent(text)', 'EXECUTE'),
    'anon EXECUTE bot_character_is_system_opponent (opponent loadout RLS)'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.bot_character_owned_by_caller(text)', 'EXECUTE'),
    'anon must not EXECUTE bot_character_owned_by_caller'
  );
  perform tests.assert(
    not has_table_privilege('authenticated', 'public.characters', 'SELECT'),
    'authenticated must still lack SELECT on characters (SEC)'
  );
  perform tests.assert(
    not has_table_privilege('anon', 'public.characters', 'SELECT'),
    'anon must still lack SELECT on characters (SEC)'
  );
  raise notice 'TEST-OK 0021 helper privileges (no characters GRANT)';

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  select count(*) into v_count
    from public.current_bot_loadouts
   where character_id = 'player-hero';
  perform tests.assert(v_count = 1, 'authenticated can read own current loadout via RLS helpers');

  select count(*) into v_count
    from public.current_bot_loadouts
   where character_id = 'opp-sir-bot';
  perform tests.assert(v_count = 1, 'authenticated can read opponent current loadout via RLS helpers');

  select count(*) into v_count
    from public.bot_loadout_versions
   where character_id = 'player-hero';
  perform tests.assert(v_count >= 1, 'authenticated can read own loadout versions');
  reset role;

  -- Cross-account fixture as table owner, then re-check as caller
  insert into public.accounts (id) values (v_other) on conflict do nothing;
  insert into public.characters (character_id, account_id, display_name, is_opponent)
  values ('other-hero', v_other, 'Other', false)
  on conflict (character_id) do nothing;
  insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
  select 'other-hero',
         '{"chassis":"chassis-basic","paint":"paint-cobalt","weapon":"weapon-sword","shield":null,"drone":null,"decals":[],"soundTags":["chassis.light","weapon.sword"]}'::jsonb,
         'v1'
   where not exists (
     select 1 from public.bot_loadout_versions where character_id = 'other-hero'
   );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  select count(*) into v_count
    from public.current_bot_loadouts
   where character_id = 'other-hero';
  perform tests.assert(v_count = 0, 'cross-account loadout hidden without characters GRANT');

  begin
    perform 1 from public.characters where character_id = 'player-hero';
    -- If SELECT somehow works, fail the SEC invariant.
    if found then
      raise exception 'SEC FAIL: authenticated SELECT on characters succeeded';
    end if;
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;

  reset role;
  raise notice 'TEST-OK 0021 loadout RLS via SECURITY DEFINER helpers';

  -- =========================================================================
  -- 0022 / C5: list_ranking — progression XP board, authenticated only
  -- =========================================================================
  perform tests.assert(
    has_function_privilege('authenticated', 'public.list_ranking()', 'EXECUTE'),
    'authenticated EXECUTE list_ranking'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.list_ranking()', 'EXECUTE'),
    'anon must not EXECUTE list_ranking'
  );
  perform tests.assert(
    not has_function_privilege('service_role', 'public.list_ranking()', 'EXECUTE'),
    'service_role must not EXECUTE list_ranking'
  );

  -- Early suite truncates progression_ledger (append-only cleanup). Restore the
  -- 1002 ranking-peer XP packs as table owner so list_ranking has a known board.
  -- Peers/characters themselves remain from seed; this only re-appends XP rows.
  reset role;
  perform tests.assert(
    exists (select 1 from public.characters where character_id = 'peer-bolt' and is_opponent = false),
    'ranking peer-bolt character present'
  );
  if not exists (
    select 1 from public.progression_ledger where character_id = 'peer-bolt'
  ) then
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000000011', 'peer-bolt', 2, 'battle'),
      ('00000000-0000-4000-8000-000000000011', 'peer-bolt', 2, 'battle'),
      ('00000000-0000-4000-8000-000000000011', 'peer-bolt', 2, 'battle');
  end if;
  if not exists (
    select 1 from public.progression_ledger where character_id = 'peer-clank'
  ) then
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000000012', 'peer-clank', 2, 'battle'),
      ('00000000-0000-4000-8000-000000000012', 'peer-clank', 1, 'battle');
  end if;
  if not exists (
    select 1 from public.progression_ledger where character_id = 'peer-rivet'
  ) then
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000000013', 'peer-rivet', 1, 'battle');
  end if;
  perform tests.assert(
    (select coalesce(sum(delta_xp), 0) from public.progression_ledger where character_id = 'peer-bolt') = 6,
    'restored peer-bolt XP totals 6'
  );
  perform tests.assert(
    (select coalesce(sum(delta_xp), 0) from public.progression_ledger where character_id = 'peer-clank') = 3,
    'restored peer-clank XP totals 3'
  );
  perform tests.assert(
    (select coalesce(sum(delta_xp), 0) from public.progression_ledger where character_id = 'peer-rivet') = 1,
    'restored peer-rivet XP totals 1'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.list_ranking();
  perform tests.assert((v_res->>'ok')::boolean, 'list_ranking ok');
  perform tests.assert(jsonb_typeof(v_res->'rows') = 'array', 'list_ranking rows array');
  select count(*)::int into v_count from jsonb_array_elements(v_res->'rows');
  perform tests.assert(v_count >= 4, format('expected >=4 ranking rows (hero+peers), got %s', v_count));
  -- Do not assume peer-bolt is rank 1: earlier suite steps award XP to player-hero.
  perform tests.assert(
    (v_res->'rows'->0->>'rank')::integer = 1,
    'first row rank is 1'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r->>'characterId' = 'peer-bolt'
         and (r->>'totalXp')::integer = 6
    ),
    'peer-bolt list_ranking totalXp is 6'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r->>'characterId' = 'peer-clank'
         and (r->>'totalXp')::integer = 3
    ),
    'peer-clank list_ranking totalXp is 3'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r->>'characterId' = 'peer-rivet'
         and (r->>'totalXp')::integer = 1
    ),
    'peer-rivet list_ranking totalXp is 1'
  );
  -- Server order: totalXp desc, then characterId asc. Adjacent rows must obey.
  -- (Earlier suite steps may award XP to player-hero, so absolute ranks vary.)
  perform tests.assert(
    coalesce(
      (
        select bool_and(
          (a.elem->>'totalXp')::integer > (b.elem->>'totalXp')::integer
          or (
            (a.elem->>'totalXp')::integer = (b.elem->>'totalXp')::integer
            and (a.elem->>'characterId') <= (b.elem->>'characterId')
          )
        )
          and bool_and((a.elem->>'rank')::integer + 1 = (b.elem->>'rank')::integer)
        from jsonb_array_elements(v_res->'rows') with ordinality as a(elem, idx)
        join jsonb_array_elements(v_res->'rows') with ordinality as b(elem, idx)
          on b.idx = a.idx + 1
      ),
      false
    ),
    'list_ranking preserves XP desc / characterId asc with dense ranks'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r->>'characterId' = 'player-hero'
         and (r->>'isCurrentBot')::boolean = true
    ),
    'caller hero marked isCurrentBot'
  );
  perform tests.assert(
    (
      select count(*)::int
        from jsonb_array_elements(v_res->'rows') r
       where (r->>'isCurrentBot')::boolean = true
    ) = 1,
    'exactly one isCurrentBot row'
  );
  -- Client must not need characters SELECT for ranking.
  begin
    perform 1 from public.characters where character_id = 'player-hero';
    if found then
      raise exception 'SEC FAIL: authenticated SELECT on characters succeeded during ranking test';
    end if;
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  -- Cross-account: seeded peer caller sees only their own isCurrentBot flag.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000011',
    true
  );
  set local role authenticated;
  v_res := public.list_ranking();
  perform tests.assert((v_res->>'ok')::boolean, 'list_ranking ok as peer');
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r->>'characterId' = 'peer-bolt'
         and (r->>'isCurrentBot')::boolean = true
    ),
    'peer caller: peer-bolt isCurrentBot'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r->>'characterId' = 'player-hero'
         and (r->>'isCurrentBot')::boolean = false
    ),
    'peer caller: player-hero is not YOU'
  );
  perform tests.assert(
    (
      select count(*)::int
        from jsonb_array_elements(v_res->'rows') r
       where (r->>'isCurrentBot')::boolean = true
    ) = 1,
    'peer caller: exactly one isCurrentBot row'
  );
  reset role;

  set local role anon;
  begin
    perform public.list_ranking();
    raise exception 'ANON FAIL: list_ranking allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;
  raise notice 'TEST-OK C5 list_ranking';
end $$;

-- =========================================================================
-- C12: player_identities (0023) — Edge/service_role write; authenticated own read
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_other uuid := '11111111-1111-4111-8111-111111111111';
  v_count int;
begin
  perform tests.assert(
    to_regclass('public.player_identities') is not null,
    'player_identities table present'
  );

  insert into public.accounts (id) values (v_other) on conflict do nothing;

  -- service_role / owner path inserts identities (Edge shape)
  insert into public.player_identities (account_id, provider, platform_id)
  values
    (v_account, 'game_center', 'T:seed-player'),
    (v_account, 'device_fallback', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  on conflict (provider, platform_id) do nothing;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  select count(*)::int into v_count from public.player_identities;
  perform tests.assert(v_count >= 1, 'authenticated can read own player_identities');

  -- cannot insert as authenticated (no write policy)
  begin
    insert into public.player_identities (account_id, provider, platform_id)
    values (v_account, 'play_games', 'should-fail');
    raise exception 'AUTHZ FAIL: authenticated insert into player_identities allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' or sqlerrm like '%policy%' then null; else raise; end if;
  end;

  reset role;

  -- unique (provider, platform_id)
  begin
    insert into public.player_identities (account_id, provider, platform_id)
    values (v_other, 'game_center', 'T:seed-player');
    raise exception 'UNIQUE FAIL: duplicate provider+platform_id allowed';
  exception
    when unique_violation then null;
  end;

  raise notice 'TEST-OK C12 player_identities';
end $$;

-- =========================================================================
-- R5: account deletion (0024) — soft-delete, grants, deletion code
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_other uuid := '11111111-1111-4111-8111-111111111111';
  v_res jsonb;
  v_code text;
  v_hash text;
  v_count int;
  v_name text;
  v_deleted_at timestamptz;
begin
  perform tests.assert(
    exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'accounts'
         and column_name = 'deleted_at'
    ),
    'accounts.deleted_at present'
  );

  perform tests.assert(
    has_function_privilege('authenticated', 'public.mint_my_deletion_code()', 'EXECUTE'),
    'authenticated EXECUTE mint_my_deletion_code'
  );
  perform tests.assert(
    not has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE'),
    'authenticated must not EXECUTE delete_my_account (Edge-only path)'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE'),
    'anon must not EXECUTE delete_my_account'
  );
  perform tests.assert(
    not has_function_privilege('authenticated', 'public.admin_delete_account(uuid)', 'EXECUTE'),
    'authenticated must not EXECUTE admin_delete_account'
  );
  perform tests.assert(
    has_function_privilege('service_role', 'public.admin_delete_account(uuid)', 'EXECUTE'),
    'service_role EXECUTE admin_delete_account'
  );

  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_other,
    'other-player-r5@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id) values (v_other) on conflict do nothing;
  insert into public.profiles (account_id, display_name)
  values (v_other, 'Other Pilot')
  on conflict (account_id) do update set display_name = excluded.display_name;
  -- Prefer updating an existing owned character; otherwise insert a dedicated one.
  update public.characters
     set display_name = 'Other Pilot'
   where account_id = v_other
     and is_opponent = false;
  if not found then
    insert into public.characters (character_id, account_id, display_name, is_opponent)
    values ('char-other-r5', v_other, 'Other Pilot', false)
    on conflict (character_id) do nothing;
  end if;
  insert into public.player_identities (account_id, provider, platform_id)
  values (v_other, 'device_fallback', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  on conflict (provider, platform_id) do nothing;

  -- mint + delete as the other account
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;

  v_res := public.mint_my_deletion_code();
  perform tests.assert((v_res->>'ok')::boolean, 'mint_my_deletion_code ok');
  v_code := v_res->>'deletionCode';
  perform tests.assert(char_length(v_code) = 32, 'deletion code is 32 hex chars');

  reset role;
  v_hash := encode(digest(v_code, 'sha256'), 'hex');
  select deletion_code_hash into v_name from public.accounts where id = v_other;
  perform tests.assert(v_name = v_hash, 'deletion_code_hash stored');

  -- anon cannot delete
  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    perform public.delete_my_account();
    raise exception 'ANON FAIL: delete_my_account allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  -- authenticated cannot call delete_my_account (M1 Edge-only)
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;
  begin
    perform public.delete_my_account();
    raise exception 'AUTHENTICATED FAIL: delete_my_account allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  -- soft-delete via service_role admin path (Edge JWT equivalent).
  -- Capture under service_role, assert as owner (tests schema not granted
  -- to service_role — same pattern as admin_delete_account_by_code_hash below).
  set local role service_role;
  v_res := public.admin_delete_account(v_other);
  reset role;
  perform tests.assert((v_res->>'ok')::boolean, 'admin_delete_account ok');

  select deleted_at, display_name
    into v_deleted_at, v_name
    from public.accounts a
    join public.profiles p on p.account_id = a.id
   where a.id = v_other;
  perform tests.assert(v_deleted_at is not null, 'deleted_at set');
  perform tests.assert(v_name = 'Deleted', 'profile anonymized');

  select display_name into v_name
    from public.characters
   where account_id = v_other and is_opponent = false
   limit 1;
  perform tests.assert(v_name = 'Deleted', 'character anonymized');

  select count(*)::int into v_count
    from public.player_identities
   where account_id = v_other;
  perform tests.assert(v_count = 0, 'player_identities unlinked');

  select deletion_code_hash into v_name from public.accounts where id = v_other;
  perform tests.assert(v_name is null, 'deletion_code_hash cleared');

  -- owned character read fails closed
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  perform tests.assert(v_res->>'ok' = 'false', 'get_owned_character not ok after delete');
  perform tests.assert(v_res->>'code' = 'account_deleted', 'account_deleted code');
  reset role;

  -- service_role code-hash path (idempotent / second account via admin)
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    '22222222-2222-4222-8222-222222222222',
    'code-delete-r5@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id)
  values ('22222222-2222-4222-8222-222222222222')
  on conflict do nothing;
  update public.accounts
     set deletion_code_hash = encode(digest('cccccccccccccccccccccccccccccccc', 'sha256'), 'hex'),
         deleted_at = null
   where id = '22222222-2222-4222-8222-222222222222';

  -- Capture under service_role, assert as owner (tests schema not granted
  -- to service_role — same pattern as SEC admin grant lockdown).
  set local role service_role;
  v_res := public.admin_delete_account_by_code_hash(
    encode(digest('cccccccccccccccccccccccccccccccc', 'sha256'), 'hex')
  );
  reset role;
  perform tests.assert((v_res->>'ok')::boolean, 'admin_delete_account_by_code_hash ok');

  -- seed account still intact (cross-account isolation)
  select deleted_at into v_deleted_at from public.accounts where id = v_account;
  perform tests.assert(v_deleted_at is null, 'seed account not deleted');

  raise notice 'TEST-OK R5 account deletion';
end $$;

-- =========================================================================
-- B4: RPC grant lockdown + pinned search_path (0025)
-- =========================================================================
do $$
declare
  r record;
  v_cfg text;
  v_fn_count int := 0;
  v_path_count int := 0;
  v_public_exec boolean;
begin
  -- Atlas helpers: service_role EXECUTE only --------------------------------
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args,
           coalesce(p.proacl, acldefault('f', p.proowner)) as acl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'atlas_lock_versions',
         'atlas_version_status',
         'atlas_storage_objects_guard',
         'atlas_manifest_entries_immutability'
       )
     order by p.proname, 3
  loop
    v_fn_count := v_fn_count + 1;
    select exists (
      select 1
        from aclexplode(r.acl) a
       where a.grantee = 0
         and a.privilege_type = 'EXECUTE'
    ) into v_public_exec;
    perform tests.assert(
      not v_public_exec,
      format('PUBLIC must not EXECUTE %s(%s)', r.proname, r.args)
    );
    perform tests.assert(
      not has_function_privilege('anon', r.oid, 'EXECUTE'),
      format('anon must not EXECUTE %s(%s)', r.proname, r.args)
    );
    perform tests.assert(
      not has_function_privilege('authenticated', r.oid, 'EXECUTE'),
      format('authenticated must not EXECUTE %s(%s)', r.proname, r.args)
    );
    perform tests.assert(
      has_function_privilege('service_role', r.oid, 'EXECUTE'),
      format('service_role must EXECUTE %s(%s)', r.proname, r.args)
    );
  end loop;
  perform tests.assert(v_fn_count = 4, format('expected 4 atlas helpers, got %s', v_fn_count));

  -- prepare_fight_context: authenticated + service_role; not PUBLIC/anon ----
  perform tests.assert(
    has_function_privilege(
      'authenticated',
      'public.prepare_fight_context(uuid, text)',
      'EXECUTE'
    ),
    'authenticated EXECUTE prepare_fight_context (Confirm eligibility)'
  );
  perform tests.assert(
    has_function_privilege(
      'service_role',
      'public.prepare_fight_context(uuid, text)',
      'EXECUTE'
    ),
    'service_role EXECUTE prepare_fight_context (combat-v1)'
  );
  perform tests.assert(
    not has_function_privilege(
      'anon',
      'public.prepare_fight_context(uuid, text)',
      'EXECUTE'
    ),
    'anon must not EXECUTE prepare_fight_context'
  );
  select exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public'
       and p.proname = 'prepare_fight_context'
       and pg_get_function_identity_arguments(p.oid) = 'uuid, text'
       and a.grantee = 0
       and a.privilege_type = 'EXECUTE'
  ) into v_public_exec;
  perform tests.assert(
    not v_public_exec,
    'PUBLIC must not EXECUTE prepare_fight_context'
  );

  -- Pinned search_path on advisor mutable set + grant-set re-assert ---------
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args,
           p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         '_final_hp_from_replay',
         '_outbox_validate_row',
         'atlas_versions_immutability',
         'battle_participant_pin_atlas_version',
         'atlas_storage_prefix',
         'atlas_lock_versions',
         'atlas_version_status',
         'atlas_storage_objects_guard',
         'atlas_manifest_entries_immutability',
         'prepare_fight_context'
       )
  loop
    v_path_count := v_path_count + 1;
    v_cfg := array_to_string(r.proconfig, ',');
    perform tests.assert(
      v_cfg is not null and v_cfg ~* 'search_path=',
      format('%s(%s) must pin search_path (proconfig=%s)', r.proname, r.args, coalesce(v_cfg, '<null>'))
    );
  end loop;
  perform tests.assert(
    v_path_count = 10,
    format('expected 10 search_path-pinned functions, got %s', v_path_count)
  );

  raise notice 'TEST-OK B4 RPC grants + search_path harden';
end $$;
