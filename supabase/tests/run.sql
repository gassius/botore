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
  -- A6/E7: 8 solids + hazard/racing (+ legacy crimson/cobalt aliases) = 10
  perform tests.assert(v_count = 10, 'expected 10 active paints');

  select count(*) into v_count from public.parts_catalogue
   where slot_kind = 'weapon' and is_active;
  -- A4 weapons v1 unlock: sword/axe/dagger + mace/hammer/spear/shield = 7
  perform tests.assert(v_count = 7, 'expected 7 active weapons');

  select count(*) into v_count from public.current_bot_loadouts;
  -- E2 NPC seed (seed.sql) adds more confirmed loadouts; still require the four
  -- original seed.sql bots (hero + 3 opponents).
  perform tests.assert(v_count >= 4, format('expected >=4 current loadouts, got %s', v_count));
  perform tests.assert(
    (
      select count(*)::int from public.current_bot_loadouts
       where character_id in ('player-hero', 'opp-sir-bot', 'opp-dex-bot', 'opp-hp-bot')
    ) = 4,
    'hero + 3 opponent loadouts present'
  );

  select count(*) into v_count from public.inventory_balances
   where account_id = v_account;
  -- chassis + 10 paints + 7 weapons + 10 A4 shapes (0039)
  perform tests.assert(v_count = 28, 'expected player to own 28 catalogue parts');
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
  -- Proof (~25) + workshop-frame kit-v003 layers (20 assets × 5) ≥ 100.
  perform tests.assert(v_count >= 100, format('expected >=100 manifest entries on consolidated v1, got %s', v_count));

  perform tests.assert(
    coalesce(array_length(public.atlas_missing_storage_paths('v1'), 1), 0) = 0,
    'v1 has no missing Storage paths'
  );

  select count(*) into v_count
    from storage.objects
   where bucket_id = 'atlas' and name like 'v1/%';
  perform tests.assert(v_count >= 100, format('expected >=100 storage objects for v1, got %s', v_count));

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
      and jsonb_array_length(v_manifest->'entries') >= 100,
    'manifest entries array populated'
  );
  raise notice 'TEST-OK atlas v1 proof pack + get_atlas_manifest';

  -- BT-171: workshop-frame kit-v003 lives on consolidated v1 (v2/v3 retired) ----
  perform tests.assert(
    exists (
      select 1 from public.atlas_manifest_entries
       where version = 'v1' and path = 'parts/torso/oxide.png' and part_id = 'torso'
    ),
    'v1 has parts/torso/oxide.png'
  );
  perform tests.assert(
    exists (
      select 1 from public.atlas_manifest_entries
       where version = 'v1'
         and path = 'parts/hand-r-wrap/oxide.png'
         and part_id = 'hand-r-wrap'
    ),
    'v1 has hand-r-wrap oxide'
  );
  perform tests.assert(
    exists (
      select 1 from public.atlas_manifest_entries
       where version = 'v1'
         and path = 'parts/weapon-axe/oxide.png'
         and part_id = 'weapon-axe'
    ),
    'v1 weapon id is hyphenated (weapon-axe)'
  );
  -- LIKE '_' is a single-char wildcard — escape so we reject literal weapon_sword
  -- folders, not hyphenated weapon-sword paths.
  perform tests.assert(
    not exists (
      select 1 from public.atlas_manifest_entries
       where version = 'v1'
         and (
           path like '%weapon\_sword%' escape '\'
           or path like '%weapon\_axe%' escape '\'
           or path like '%weapon\_dagger%' escape '\'
           or path like '%/v001/%'
           or path like '%/v002/%'
           or part_id in ('weapon_sword', 'weapon_axe', 'weapon_dagger')
         )
    ),
    'v1 must not register underscore weapon folders or kit-v001/v002 paths'
  );
  perform tests.assert(
    not exists (
      select 1 from public.atlas_versions where version in ('v2', 'v3') and status = 'draft'
    ),
    'draft v2/v3 registrations retired'
  );
  raise notice 'TEST-OK atlas v1 workshop-frame-v003 pack + wraps + hyphen weapon ids';

  -- Dev-only reopen: private.environment marker + confirm gate + published→draft ----
  perform set_config('request.jwt.claim.role', 'service_role', true);
  insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
  values ('v900010', 'draft', null, '{"version":"v900010"}'::jsonb, false, 'reopen fixture');
  insert into public.atlas_manifest_entries (version, asset_key, kind, part_id, role, path)
  values ('v900010', 'manifest.root', 'manifest', null, 'manifest', 'manifest.json');
  -- Fabricate a storage object so we can publish (test-only; bootstrap uses API).
  insert into storage.objects (bucket_id, name, metadata)
  values ('atlas', 'v900010/manifest.json', '{"fixture":true}'::jsonb);
  perform public.publish_atlas_version('v900010');

  -- Fail closed when private.environment row is absent (Production never inserts).
  delete from private.environment;
  begin
    perform public.dev_reopen_atlas_version('v900010', 'DEVELOPMENT_ONLY_REOPEN');
    raise exception 'REOPEN FAIL: env marker missing should reject';
  exception
    when others then
      if sqlstate = '42501' and sqlerrm like '%private.environment=development%' then null;
      else raise;
      end if;
  end;
  perform tests.assert(
    (select status from public.atlas_versions where version = 'v900010') = 'published',
    'v900010 still published when env marker row absent'
  );
  -- Trigger guard: reopen GUC alone is not enough when marker is absent.
  perform set_config('app.atlas_dev_reopen', 'on', true);
  begin
    update public.atlas_versions
       set status = 'draft', published_at = null
     where version = 'v900010';
    raise exception 'IMMUTABILITY FAIL: published→draft with GUC but marker absent';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_version_immutable%' then null;
      else raise;
      end if;
  end;
  perform tests.assert(
    (select status from public.atlas_versions where version = 'v900010') = 'published',
    'v900010 still published after direct reopen attempt with marker absent'
  );
  perform set_config('app.atlas_dev_reopen', '', true);

  -- Fail closed when marker is production (never reopen).
  insert into private.environment (singleton, env) values (true, 'production')
  on conflict (singleton) do update set env = excluded.env;
  begin
    perform public.dev_reopen_atlas_version('v900010', 'DEVELOPMENT_ONLY_REOPEN');
    raise exception 'REOPEN FAIL: production marker should reject';
  exception
    when others then
      if sqlstate = '42501' and sqlerrm like '%private.environment=development%' then null;
      else raise;
      end if;
  end;
  perform tests.assert(
    (select status from public.atlas_versions where version = 'v900010') = 'published',
    'v900010 still published when env marker is production'
  );
  -- Trigger guard: reopen GUC alone is not enough when marker is production.
  perform set_config('app.atlas_dev_reopen', 'on', true);
  begin
    update public.atlas_versions
       set status = 'draft', published_at = null
     where version = 'v900010';
    raise exception 'IMMUTABILITY FAIL: published→draft with GUC but marker production';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_version_immutable%' then null;
      else raise;
      end if;
  end;
  perform tests.assert(
    (select status from public.atlas_versions where version = 'v900010') = 'published',
    'v900010 still published after direct reopen attempt with production marker'
  );
  perform set_config('app.atlas_dev_reopen', '', true);

  -- Development marker allows reopen (Infra INSERT on Dev DB; never from migrations).
  insert into private.environment (singleton, env) values (true, 'development')
  on conflict (singleton) do update set env = excluded.env;

  begin
    perform public.dev_reopen_atlas_version('v900010', 'wrong');
    raise exception 'REOPEN FAIL: confirm gate missing';
  exception
    when others then
      if sqlstate = '22023' and sqlerrm like 'atlas_dev_reopen_confirm_required%' then null;
      else raise;
      end if;
  end;
  select public.dev_reopen_atlas_version('v900010', 'DEVELOPMENT_ONLY_REOPEN') into v_manifest;
  perform tests.assert(
    (v_manifest->>'status') = 'draft' or coalesce((v_manifest->>'alreadyDraft')::boolean, false),
    format('dev_reopen returns draft, got %s', v_manifest)
  );
  perform tests.assert(
    (select status from public.atlas_versions where version = 'v900010') = 'draft',
    'v900010 reopened to draft'
  );
  -- Production immutability still blocks plain updates without the RPC/GUC.
  update public.atlas_versions
     set status = 'published', published_at = now()
   where version = 'v900010' and status = 'draft';
  begin
    update public.atlas_versions set notes = 'hack' where version = 'v900010';
    raise exception 'IMMUTABILITY FAIL: modified published without reopen';
  exception
    when others then
      if sqlstate = '55000' and sqlerrm like 'atlas_version_immutable%' then null;
      else raise;
      end if;
  end;
  -- Drop back to draft: same-transaction now() ties break on version desc, so a
  -- leftover published v900010 would beat later fixture v900001 for latest_version.
  perform public.dev_reopen_atlas_version('v900010', 'DEVELOPMENT_ONLY_REOPEN');
  perform tests.assert(
    (select status from public.atlas_versions where version = 'v900010') = 'draft',
    'v900010 left draft after reopen coverage'
  );
  -- Leave no marker so later suites stay fail-closed by default.
  delete from private.environment;
  raise notice 'TEST-OK atlas dev_reopen_atlas_version gated reopen';

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
  -- A5 name + Botore exact; W–L floor ≥ seed (F3 suites may add battles first).
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'opponents') o
       where o->>'characterId' = 'opp-dex-bot'
         and o->>'displayName' = 'Can Hook'
         and o->>'botoreName' = 'Magistra Volta'
         and (o->>'wins')::integer >= 19
         and (o->>'losses')::integer >= 2
    ),
    'opp-dex-bot A5 roster + botore + W-L'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'opponents') o
       where o->>'characterId' = 'opp-hp-bot'
         and o->>'displayName' = 'Cobalt Brute'
         and o->>'botoreName' = 'Doctore Ferro'
         and (o->>'wins')::integer >= 15
         and (o->>'losses')::integer >= 5
    ),
    'opp-hp-bot A5 roster + botore + W-L'
  );
  perform tests.assert(
    exists (
      select 1
        from jsonb_array_elements(v_res->'opponents') o
       where o->>'characterId' = 'opp-sir-bot'
         and o->>'displayName' = 'Slab Mick'
         and o->>'botoreName' = 'Tito Rivet'
         and (o->>'wins')::integer >= 13
         and (o->>'losses')::integer >= 6
    ),
    'opp-sir-bot A5 roster + botore + W-L'
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

  -- B1 table checks as postgres — authenticated has no SELECT on characters /
  -- opponent_lanistas (capture-only; client reads go through the RPC above).
  perform tests.assert(
    not exists (
      select 1 from public.characters
       where is_opponent and account_id is not null
    ),
    'system opponents keep account_id null (opponents_unowned)'
  );
  perform tests.assert(
    (select count(*)::int from public.opponent_lanistas) = 3,
    'opponent_lanistas maps three seed opponents'
  );
  perform tests.assert(
    exists (
      select 1
        from public.opponent_lanistas ol
        join public.profiles p on p.account_id = ol.lanista_account_id
       where ol.character_id = 'opp-dex-bot'
         and p.display_name = 'Magistra Volta'
    )
    and exists (
      select 1
        from public.opponent_lanistas ol
        join public.profiles p on p.account_id = ol.lanista_account_id
       where ol.character_id = 'opp-hp-bot'
         and p.display_name = 'Doctore Ferro'
    )
    and exists (
      select 1
        from public.opponent_lanistas ol
        join public.profiles p on p.account_id = ol.lanista_account_id
       where ol.character_id = 'opp-sir-bot'
         and p.display_name = 'Tito Rivet'
    ),
    'opponent_lanistas maps each A5 opponent to its Botore profile'
  );
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

-- ---------------------------------------------------------------------------
-- B5: ensure_player_character + atlas-independent starter loadout
-- ---------------------------------------------------------------------------
-- Pattern (same as R5 / B2): capture under service_role / authenticated, then
-- RESET ROLE before tests.assert — service_role has no USAGE on schema tests.
do $$
declare
  v_account uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001';
  v_auto uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002';
  v_res jsonb;
  v_res2 jsonb;
  v_character_id text;
  v_botore_id text;
  v_loadout_id uuid;
  v_count integer;
  v_loadout_ok boolean;
  v_owned_ok boolean;
  v_owned_id text;
  v_auto_ok boolean;
  v_auto_id text;
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'b5-ensure@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  -- Intentionally no accounts / characters / loadout yet.

  -- Capture under service_role (Edge path), assert as owner.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  set local role service_role;
  v_res := public.ensure_player_character(v_account);
  v_character_id := v_res->>'characterId';
  v_res2 := public.ensure_player_character(v_account);
  reset role;

  perform tests.assert((v_res->>'ok')::boolean, 'ensure creates character');
  perform tests.assert((v_res->>'created')::boolean, 'created=true first call');
  perform tests.assert(
    v_character_id = 'player-' || replace(v_account::text, '-', ''),
    'deterministic character id'
  );
  perform tests.assert((v_res2->>'ok')::boolean, 'ensure idempotent ok');
  perform tests.assert((v_res2->>'created')::boolean = false, 'created=false on retry');
  perform tests.assert(v_res2->>'characterId' = v_character_id, 'same character id');

  -- E2 Minor: player-facing botoreId / botId must not be bare UUID or 32-hex.
  select p.botore_id into v_botore_id
    from public.profiles p
   where p.account_id = v_account;
  perform tests.assert(
    v_botore_id ~ '^garage-[0-9a-f]{12}$',
    'ensure botoreId uses garage-<12 hex>'
  );
  perform tests.assert(
    v_botore_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and v_botore_id !~* '^[0-9a-f]{32}$',
    'ensure botoreId rejects UUID / 32-hex shapes'
  );
  perform tests.assert(
    v_character_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and v_character_id !~* '^[0-9a-f]{32}$',
    'ensure botId rejects bare UUID / 32-hex shapes'
  );

  select count(*)::int into v_count
    from public.character_build_versions where character_id = v_character_id;
  perform tests.assert(v_count = 1, 'starter build present');

  select count(*)::int into v_count
    from public.inventory_ledger
   where account_id = v_account and reason = 'grant' and delta > 0;
  perform tests.assert(v_count >= 3, 'starter inventory grants');

  select loadout_version_id into v_loadout_id
    from public.current_bot_loadouts where character_id = v_character_id;
  perform tests.assert(v_loadout_id is not null, 'starter loadout present');

  -- Atlas independence: direct bot_loadout_versions insert (no save_bot_loadout).
  select exists (
    select 1 from public.bot_loadout_versions
     where character_id = v_character_id
       and atlas_version = 'v1'
       and loadout->>'chassis' = 'chassis-basic'
       and loadout->>'paint' = 'paint-crimson'
       and loadout->>'weapon' = 'weapon-sword'
  ) into v_loadout_ok;
  perform tests.assert(v_loadout_ok, 'starter loadout shape pinned without save_bot_loadout');

  select count(*)::int into v_count
    from public.bot_loadout_versions where character_id = v_character_id;
  perform tests.assert(v_count = 1, 'no duplicate loadout versions');

  -- Authenticated get_owned_character after ensure (capture then assert).
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  v_owned_ok := coalesce((v_res->>'ok')::boolean, false);
  v_owned_id := v_res->>'characterId';
  reset role;
  perform tests.assert(v_owned_ok, 'get_owned_character after ensure');
  perform tests.assert(v_owned_id = v_character_id, 'owned character matches');

  -- Fresh account: get_owned_character auto-provisions without prior ensure.
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_auto,
    'b5-auto@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id) values (v_auto)
  on conflict do nothing;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_auto::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  v_auto_ok := coalesce((v_res->>'ok')::boolean, false);
  v_auto_id := v_res->>'characterId';
  reset role;
  perform tests.assert(v_auto_ok, 'get_owned_character auto-provisions');
  perform tests.assert(
    v_auto_id = 'player-aaaaaaaabbbb4ccc8dddeeeeeeee0002',
    'auto-provision character id'
  );

  select count(*)::int into v_count
    from public.current_bot_loadouts
   where character_id = 'player-aaaaaaaabbbb4ccc8dddeeeeeeee0002';
  perform tests.assert(v_count = 1, 'auto-provision starter loadout');

  -- Anon cannot execute ensure
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
  begin
    perform public.ensure_player_character(v_account);
    raise exception 'ANON FAIL: ensure_player_character allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  -- Authenticated A cannot ensure for account B (SECURITY DEFINER body gate;
  -- never current_user — see 0014). Capture under JWT role, assert as owner.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  begin
    perform public.ensure_player_character(v_auto);
    reset role;
    raise exception 'CROSS-ACCOUNT FAIL: ensure_player_character(B) as A allowed';
  exception
    when insufficient_privilege then
      reset role;
    when others then
      reset role;
      if sqlerrm like 'forbidden:%' or sqlstate = '42501' then
        null;
      else
        raise;
      end if;
  end;

  raise notice 'TEST-OK B5 ensure_player_character';
end $$;

-- ---------------------------------------------------------------------------
-- E1: authenticated Customise save re-pins current draft atlas (paint+weapon)
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00e1';
  v_other uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00e2';
  v_character_id text;
  v_version uuid;
  v_prev uuid;
  v_before uuid;
  v_after uuid;
  v_loadout jsonb;
  v_atlas text;
  v_draft text := 'v900028';
  v_other_draft text := 'v900029';
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'e1-save@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  set local role service_role;
  perform public.ensure_player_character(v_account);
  reset role;

  select character_id into v_character_id
    from public.characters
   where account_id = v_account and is_opponent = false
   limit 1;
  perform tests.assert(v_character_id is not null, 'E1 character present');

  -- Force a dedicated draft atlas pin (do not rely on v1 publish state in CI).
  insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
  values (
    v_draft, 'draft', null, '{"version":"v900028","note":"e1-draft"}'::jsonb, false,
    'E1 draft fixture — never publish'
  )
  on conflict (version) do update
    set status = 'draft', published_at = null;

  insert into public.atlas_versions (version, status, published_at, manifest, budgets_final, notes)
  values (
    v_other_draft, 'draft', null, '{"version":"v900029","note":"e1-other-draft"}'::jsonb, false,
    'E1 other draft — pin must fail'
  )
  on conflict (version) do update
    set status = 'draft', published_at = null;

  -- Explicit later created_at: DISTINCT ON current view ties on same-tx now().
  insert into public.bot_loadout_versions (
    character_id, loadout, atlas_version, created_at
  ) values (
    v_character_id,
    jsonb_build_object(
      'chassis', 'chassis-basic',
      'paint', 'paint-crimson',
      'weapon', 'weapon-sword',
      'shield', 'null'::jsonb,
      'drone', 'null'::jsonb,
      'decals', '[]'::jsonb,
      'soundTags', '["chassis.light","weapon.sword"]'::jsonb
    ),
    v_draft,
    clock_timestamp() + interval '1 second'
  );

  select loadout_version_id, atlas_version into v_prev, v_atlas
    from public.current_bot_loadouts where character_id = v_character_id;
  perform tests.assert(v_atlas = v_draft, 'E1 current atlas is draft fixture');

  -- Owner JWT: re-pin same draft while changing paint + weapon.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  begin
    v_version := public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-cobalt","weapon":"weapon-axe"}'::jsonb,
      v_draft
    );
  exception
    when others then
      reset role;
      raise;
  end;
  reset role;

  perform tests.assert(v_version is distinct from v_prev, 'E1 save appends version on draft re-pin');
  select loadout, atlas_version into v_loadout, v_atlas
    from public.bot_loadout_versions where loadout_version_id = v_version;
  perform tests.assert(v_loadout->>'paint' = 'paint-cobalt', 'E1 paint persisted');
  perform tests.assert(v_loadout->>'weapon' = 'weapon-axe', 'E1 weapon persisted');
  perform tests.assert(v_atlas = v_draft, 'E1 atlas re-pin unchanged');

  -- Different unpublished atlas still rejected.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  begin
    perform public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword"}'::jsonb,
      v_other_draft
    );
    reset role;
    raise exception 'E1 FAIL: unpublished foreign atlas pin allowed';
  exception
    when others then
      reset role;
      if sqlerrm like 'unpublished_atlas_version:%' then
        null;
      else
        raise;
      end if;
  end;

  -- Non-owner cannot re-pin the victim's current draft atlas (ownership after atlas gate).
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_other,
    'e1-other@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id) values (v_other)
  on conflict do nothing;

  select loadout_version_id into v_before
    from public.current_bot_loadouts where character_id = v_character_id;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  set local role authenticated;
  begin
    perform public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword"}'::jsonb,
      v_draft
    );
    reset role;
    raise exception 'E1 FAIL: cross-account draft re-pin allowed';
  exception
    when insufficient_privilege then
      reset role;
    when others then
      reset role;
      if sqlerrm like 'forbidden%' or sqlstate = '42501' then
        null;
      else
        raise;
      end if;
  end;

  select loadout_version_id into v_after
    from public.current_bot_loadouts where character_id = v_character_id;
  perform tests.assert(
    v_after is not distinct from v_before,
    'E1 cross-account draft re-pin left current loadout unchanged'
  );

  raise notice 'TEST-OK E1 save_bot_loadout draft current-atlas re-pin';
end $$;

-- =========================================================================
-- 0029 / seed.sql E2: bot + botore ranking (W-L, NPC seed, tie-breaks, empty)
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_res jsonb;
  v_count int;
  v_arc_rank int;
  v_patina_rank int;
  v_arc_xp int;
  v_patina_xp int;
  v_row jsonb;
  v_deleted_restore int;
  v_npc_pw_usable int;
begin
  perform tests.assert(
    has_function_privilege('authenticated', 'public.list_bot_ranking()', 'EXECUTE'),
    'authenticated EXECUTE list_bot_ranking'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.list_bot_ranking()', 'EXECUTE'),
    'anon must not EXECUTE list_bot_ranking'
  );
  perform tests.assert(
    not has_function_privilege('service_role', 'public.list_bot_ranking()', 'EXECUTE'),
    'service_role must not EXECUTE list_bot_ranking'
  );
  perform tests.assert(
    has_function_privilege('authenticated', 'public.list_botore_ranking()', 'EXECUTE'),
    'authenticated EXECUTE list_botore_ranking'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.list_botore_ranking()', 'EXECUTE'),
    'anon must not EXECUTE list_botore_ranking'
  );
  perform tests.assert(
    not has_function_privilege('service_role', 'public.list_botore_ranking()', 'EXECUTE'),
    'service_role must not EXECUTE list_botore_ranking'
  );

  -- NPC seed density (from supabase/seed.sql — not a 1xxx migration)
  reset role;
  select count(*)::int into v_npc_pw_usable
    from auth.users u
    join public.accounts a on a.id = u.id
   where a.is_npc
     and coalesce(nullif(u.encrypted_password, ''), '') <> '';
  perform tests.assert(
    v_npc_pw_usable = 0,
    'NPC auth.users have empty encrypted_password (no password login)'
  );
  perform tests.assert(
    (select count(*)::int from public.accounts where is_npc) >= 12,
    'at least 12 NPC botores seeded'
  );
  perform tests.assert(
    (
      select count(*)::int
        from public.characters
       where owner_is_npc
         and is_opponent = false
         and character_id like 'npc-bot-%'
    ) >= 20,
    'NPC bots seeded (1–3 per botore aggregate)'
  );
  perform tests.assert(
    (
      select bool_and(bot_count between 1 and 3)
        from (
          select c.account_id, count(*)::int as bot_count
            from public.characters c
            join public.accounts a on a.id = c.account_id
           where a.is_npc and c.is_opponent = false
           group by c.account_id
        ) s
    ),
    'each NPC botore owns 1–3 bots'
  );
  perform tests.assert(
    exists (
      select 1 from public.bot_fight_records
       where character_id = 'npc-bot-rivet' and wins >= 5
    ),
    'rivet has derived wins from confirmed fights'
  );

  -- Early suite truncates progression_ledger (append-only cleanup). Restore the
  -- seed.sql NPC fight XP pack + Arc's extra rows so equal-wins tie-breaks by XP.
  if not exists (
    select 1 from public.progression_ledger where character_id = 'npc-bot-rivet'
  ) then
    insert into public.progression_ledger (
      account_id, character_id, battle_id, delta_xp, reason
    )
    select
        c.account_id,
        bp.character_id,
        bp.battle_id,
        case when b.winner_id = bp.character_id then 2 else 1 end,
        'battle'
      from public.battle_participants bp
      join public.battles b on b.battle_id = bp.battle_id
      join public.characters c on c.character_id = bp.character_id
     where b.battle_id >= 'a0000000-0000-4000-8000-000000000001'
       and b.battle_id <= 'a0000000-0000-4000-8000-000000000014'
       and b.winner_id is not null
       and c.account_id is not null
       and c.owner_is_npc;
  end if;
  if not exists (
    select 1
      from public.progression_ledger
     where character_id = 'npc-bot-arc'
       and battle_id is null
       and delta_xp = 2
  ) then
    insert into public.progression_ledger (
      account_id, character_id, battle_id, delta_xp, reason
    ) values
      ('00000000-0000-4000-8000-000000001104', 'npc-bot-arc', null, 2, 'battle'),
      ('00000000-0000-4000-8000-000000001104', 'npc-bot-arc', null, 2, 'battle');
  end if;
  perform tests.assert(
    (
      select coalesce(sum(delta_xp), 0)
        from public.progression_ledger
       where character_id = 'npc-bot-arc'
    ) >
    (
      select coalesce(sum(delta_xp), 0)
        from public.progression_ledger
       where character_id = 'npc-bot-patina'
    ),
    'restored arc XP above patina for tie-break'
  );

  -- Admin views are service_role only
  perform tests.assert(
    has_table_privilege('service_role', 'public.admin_bot_ranking', 'SELECT'),
    'service_role SELECT admin_bot_ranking'
  );
  perform tests.assert(
    not has_table_privilege('authenticated', 'public.admin_bot_ranking', 'SELECT'),
    'authenticated no SELECT admin_bot_ranking'
  );
  perform tests.assert(
    has_table_privilege('service_role', 'public.admin_botore_ranking', 'SELECT'),
    'service_role SELECT admin_botore_ranking'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.list_bot_ranking();
  perform tests.assert((v_res->>'ok')::boolean, 'list_bot_ranking ok');
  perform tests.assert(v_res->>'tab' = 'bots', 'list_bot_ranking tab=bots');
  perform tests.assert(jsonb_typeof(v_res->'rows') = 'array', 'list_bot_ranking rows array');
  select count(*)::int into v_count from jsonb_array_elements(v_res->'rows');
  perform tests.assert(v_count >= 12, format('expected dense bot board, got %s', v_count));
  perform tests.assert(
    (v_res->'rows'->0->>'rank')::integer = 1,
    'bot ranking first row rank 1'
  );

  -- No account UUIDs in player-facing payload
  perform tests.assert(
    v_res::text !~ '00000000-0000-4000-8000',
    'list_bot_ranking payload has no account UUID strings'
  );
  perform tests.assert(
    not exists (
      select 1
        from jsonb_array_elements(v_res->'rows') r
       where r ? 'accountId' or r ? 'characterId'
    ),
    'bot rows use botId/botoreId (no accountId/characterId keys)'
  );

  -- Required bot fields + portrait for an NPC with loadout
  select r into v_row
    from jsonb_array_elements(v_res->'rows') r
   where r->>'botId' = 'npc-bot-rivet'
   limit 1;
  perform tests.assert(v_row is not null, 'rivet present on bot board');
  perform tests.assert(v_row->>'botName' = 'Rivet', 'rivet botName');
  perform tests.assert(v_row->>'botoreName' = 'Steel Yard', 'rivet botoreName');
  perform tests.assert(v_row->>'botoreId' = 'npc-steel-yard', 'rivet botoreId');
  perform tests.assert((v_row->>'wins')::int >= 5, 'rivet wins from fights');
  perform tests.assert(v_row->'portrait'->>'chassis' = 'chassis-basic', 'rivet portrait chassis');
  perform tests.assert(v_row->'portrait'->>'paint' is not null, 'rivet portrait paint');
  perform tests.assert(v_row->'portrait'->>'weapon' is not null, 'rivet portrait weapon');
  perform tests.assert((v_row->>'isNpc')::boolean = true, 'rivet isNpc');

  -- Caller current bot flag (hero when present)
  perform tests.assert(
    (
      select count(*)::int
        from jsonb_array_elements(v_res->'rows') r
       where (r->>'isCurrentBot')::boolean
    ) <= 1,
    'at most one isCurrentBot'
  );

  -- Tie-break: same wins, higher XP ranks first (Arc vs Patina both 2 wins)
  select (r->>'rank')::int, (r->>'totalXp')::int
    into v_arc_rank, v_arc_xp
    from jsonb_array_elements(v_res->'rows') r
   where r->>'botId' = 'npc-bot-arc';
  select (r->>'rank')::int, (r->>'totalXp')::int
    into v_patina_rank, v_patina_xp
    from jsonb_array_elements(v_res->'rows') r
   where r->>'botId' = 'npc-bot-patina';
  perform tests.assert(v_arc_rank is not null and v_patina_rank is not null, 'arc+patina on board');
  perform tests.assert(
    (select (r->>'wins')::int from jsonb_array_elements(v_res->'rows') r where r->>'botId' = 'npc-bot-arc')
    =
    (select (r->>'wins')::int from jsonb_array_elements(v_res->'rows') r where r->>'botId' = 'npc-bot-patina'),
    'arc and patina share wins for XP tie-break'
  );
  perform tests.assert(v_arc_xp > v_patina_xp, 'arc has more XP than patina');
  perform tests.assert(v_arc_rank < v_patina_rank, 'higher XP sorts before on equal wins');

  -- Adjacent rows obey bot ordering contract
  perform tests.assert(
    coalesce(
      (
        select bool_and(
          (a.elem->>'wins')::int > (b.elem->>'wins')::int
          or (
            (a.elem->>'wins')::int = (b.elem->>'wins')::int
            and (a.elem->>'totalXp')::int > (b.elem->>'totalXp')::int
          )
          or (
            (a.elem->>'wins')::int = (b.elem->>'wins')::int
            and (a.elem->>'totalXp')::int = (b.elem->>'totalXp')::int
            and (a.elem->>'losses')::int < (b.elem->>'losses')::int
          )
          or (
            (a.elem->>'wins')::int = (b.elem->>'wins')::int
            and (a.elem->>'totalXp')::int = (b.elem->>'totalXp')::int
            and (a.elem->>'losses')::int = (b.elem->>'losses')::int
            and (a.elem->>'botId') <= (b.elem->>'botId')
          )
        )
        from jsonb_array_elements(v_res->'rows') with ordinality as a(elem, idx)
        join jsonb_array_elements(v_res->'rows') with ordinality as b(elem, idx)
          on b.idx = a.idx + 1
      ),
      false
    ),
    'list_bot_ranking preserves wins/xp/losses/botId order'
  );

  v_res := public.list_botore_ranking();
  perform tests.assert((v_res->>'ok')::boolean, 'list_botore_ranking ok');
  perform tests.assert(v_res->>'tab' = 'botores', 'list_botore_ranking tab');
  select count(*)::int into v_count from jsonb_array_elements(v_res->'rows');
  perform tests.assert(v_count >= 12, format('expected >=12 botores, got %s', v_count));
  perform tests.assert(
    v_res::text !~ '00000000-0000-4000-8000',
    'list_botore_ranking payload has no account UUID strings'
  );
  perform tests.assert(
    exists (
      select 1 from jsonb_array_elements(v_res->'rows') r
       where r->>'botoreId' = 'npc-steel-yard'
         and r->>'name' = 'Steel Yard'
         and r->>'emblemId' = 'emblem-cog'
         and (r->>'botsOwned')::int = 3
         and (r->>'isNpc')::boolean
    ),
    'steel yard botore row shape'
  );
  perform tests.assert(
    exists (
      select 1 from jsonb_array_elements(v_res->'rows') r
       where (r->>'isCurrentBotore')::boolean
         and (
           r->>'botoreId' = 'botore-dev-player'
           or r->>'name' = 'Dev Player'
         )
    ),
    'caller botore marked isCurrentBotore'
  );

  -- Botore adjacent order
  perform tests.assert(
    coalesce(
      (
        select bool_and(
          (a.elem->>'wins')::int > (b.elem->>'wins')::int
          or (
            (a.elem->>'wins')::int = (b.elem->>'wins')::int
            and (a.elem->>'losses')::int < (b.elem->>'losses')::int
          )
          or (
            (a.elem->>'wins')::int = (b.elem->>'wins')::int
            and (a.elem->>'losses')::int = (b.elem->>'losses')::int
            and (a.elem->>'botsOwned')::int > (b.elem->>'botsOwned')::int
          )
          or (
            (a.elem->>'wins')::int = (b.elem->>'wins')::int
            and (a.elem->>'losses')::int = (b.elem->>'losses')::int
            and (a.elem->>'botsOwned')::int = (b.elem->>'botsOwned')::int
            and (a.elem->>'botoreId') <= (b.elem->>'botoreId')
          )
        )
        from jsonb_array_elements(v_res->'rows') with ordinality as a(elem, idx)
        join jsonb_array_elements(v_res->'rows') with ordinality as b(elem, idx)
          on b.idx = a.idx + 1
      ),
      false
    ),
    'list_botore_ranking preserves wins/losses/botsOwned/botoreId order'
  );
  reset role;

  -- Empty state: soft-delete currently-active accounts → empty boards, then restore
  -- only those ids (do not revive accounts soft-deleted by earlier R5 tests).
  reset role;
  create temporary table e2_ranking_active_accounts on commit drop as
    select id from public.accounts where deleted_at is null;
  select count(*)::int into v_deleted_restore from e2_ranking_active_accounts;
  update public.accounts a
     set deleted_at = now()
    from e2_ranking_active_accounts t
   where a.id = t.id;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.list_bot_ranking();
  perform tests.assert((v_res->>'ok')::boolean, 'empty bot board still ok');
  perform tests.assert(
    jsonb_array_length(v_res->'rows') = 0,
    'empty bot board rows=[]'
  );
  v_res := public.list_botore_ranking();
  perform tests.assert((v_res->>'ok')::boolean, 'empty botore board still ok');
  perform tests.assert(
    jsonb_array_length(v_res->'rows') = 0,
    'empty botore board rows=[]'
  );
  reset role;

  update public.accounts a
     set deleted_at = null
    from e2_ranking_active_accounts t
   where a.id = t.id;
  perform tests.assert(v_deleted_restore > 0, 'restored soft-deleted accounts after empty-state test');

  -- Anon denied
  set local role anon;
  begin
    perform public.list_bot_ranking();
    raise exception 'ANON FAIL: list_bot_ranking allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.list_botore_ranking();
    raise exception 'ANON FAIL: list_botore_ranking allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  raise notice 'TEST-OK E2 ranking bot+botore';
end $$;

-- =========================================================================
-- E3: server-driven fight quota (0032_fight_quota_config)
-- =========================================================================
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_res jsonb;
  v_day date := (now() at time zone 'utc')::date;
  v_next text;
  v_rolling_next timestamptz;
  v_cfg_limit integer;
  v_cfg_scope text;
  v_cfg_policy text;
begin
  -- Config table exists; authenticated has no direct SELECT (RPC-only).
  perform tests.assert(
    to_regclass('public.fight_quota_config') is not null,
    'fight_quota_config table exists'
  );
  perform tests.assert(
    not has_table_privilege('authenticated', 'public.fight_quota_config', 'SELECT'),
    'authenticated must not SELECT fight_quota_config'
  );
  perform tests.assert(
    not has_table_privilege('anon', 'public.fight_quota_config', 'SELECT'),
    'anon must not SELECT fight_quota_config'
  );

  select fight_limit, scope, refill_policy
    into v_cfg_limit, v_cfg_scope, v_cfg_policy
    from public.fight_quota_config
   where id = true;
  perform tests.assert(v_cfg_limit = 3, 'default fight_limit=3');
  perform tests.assert(v_cfg_scope = 'player', 'default scope=player');
  perform tests.assert(v_cfg_policy = 'daily_utc_midnight', 'default refill_policy=daily_utc_midnight');

  -- Ensure today slots exist for the seed account.
  insert into public.fight_allowances (account_id, utc_day, slot_index)
  select v_account, v_day, s
    from generate_series(1, 3) as s
  on conflict do nothing;
  update public.fight_allowances
     set used_at = null
   where account_id = v_account
     and utc_day = v_day;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.get_fight_allowance_summary();
  perform tests.assert((v_res->>'ok')::boolean, 'E3 summary ok');
  perform tests.assert((v_res->>'fightsRemaining')::integer = 3, 'remaining math full=3');
  perform tests.assert((v_res->>'limit')::integer = 3, 'limit from config');
  perform tests.assert(v_res->>'scope' = 'player', 'scope from config');
  perform tests.assert(v_res->>'refillPolicy' = 'daily_utc_midnight', 'policy from config');
  perform tests.assert(
    (v_res->>'allowancesRemaining')::integer = (v_res->>'fightsRemaining')::integer,
    'allowancesRemaining aliases fightsRemaining'
  );
  perform tests.assert(v_res->>'utcDay' = v_day::text, 'utcDay is server UTC today');

  -- nextRefillAt is formatted in UTC inside the RPC (= next UTC midnight).
  v_next := v_res->>'nextRefillAt';
  perform tests.assert(
    v_next = to_char(
      ((v_day + 1)::timestamp at time zone 'utc') at time zone 'utc',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ),
    format('daily nextRefillAt is next UTC midnight (got %s)', v_next)
  );

  -- Exhausted state
  reset role;
  update public.fight_allowances
     set used_at = now()
   where account_id = v_account
     and utc_day = v_day;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_fight_allowance_summary();
  perform tests.assert((v_res->>'fightsRemaining')::integer = 0, 'exhausted remaining=0');
  perform tests.assert((v_res->>'limit')::integer = 3, 'exhausted still reports config limit');
  reset role;

  -- Midnight UTC reset: yesterday exhausted does not affect today remaining.
  insert into public.fight_allowances (account_id, utc_day, slot_index, used_at)
  select v_account, v_day - 1, s, now() - interval '1 day'
    from generate_series(1, 3) as s
  on conflict (account_id, utc_day, slot_index) do update
    set used_at = excluded.used_at;
  update public.fight_allowances
     set used_at = null
   where account_id = v_account
     and utc_day = v_day;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_fight_allowance_summary();
  perform tests.assert(
    (v_res->>'fightsRemaining')::integer = 3,
    'UTC day rollover: today unused slots refill remaining'
  );
  reset role;

  -- rolling_per_fight fixture: switch config, assert contract without breaking daily restore.
  update public.fight_quota_config
     set refill_policy = 'rolling_per_fight',
         rolling_refill_seconds = 7200,
         fight_limit = 3,
         scope = 'player',
         updated_at = now()
   where id = true;

  -- Consume one slot so earliest used_at drives next refill.
  update public.fight_allowances
     set used_at = timestamptz '2026-11-18T10:00:00Z'
   where account_id = v_account
     and utc_day = v_day
     and slot_index = 1;
  update public.fight_allowances
     set used_at = null
   where account_id = v_account
     and utc_day = v_day
     and slot_index in (2, 3);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_fight_allowance_summary();
  perform tests.assert(v_res->>'refillPolicy' = 'rolling_per_fight', 'fixture rolling policy');
  perform tests.assert((v_res->>'fightsRemaining')::integer = 2, 'rolling remaining after one consume');
  v_rolling_next := timestamptz '2026-11-18T10:00:00Z' + interval '7200 seconds';
  perform tests.assert(
    v_res->>'nextRefillAt' = to_char(v_rolling_next at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    format('rolling nextRefillAt = earliest used_at + interval (got %s)', v_res->>'nextRefillAt')
  );
  reset role;

  -- Config limit/scope readable from RPC (not a compiled client constant).
  update public.fight_quota_config
     set fight_limit = 2,
         scope = 'bot',
         refill_policy = 'daily_utc_midnight',
         updated_at = now()
   where id = true;
  update public.fight_allowances
     set used_at = null
   where account_id = v_account
     and utc_day = v_day;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_fight_allowance_summary();
  perform tests.assert((v_res->>'limit')::integer = 2, 'limit follows config change');
  perform tests.assert(v_res->>'scope' = 'bot', 'scope follows config change');
  -- Cap remaining at config limit even if 3 unused slot rows exist.
  perform tests.assert(
    (v_res->>'fightsRemaining')::integer = 2,
    'remaining capped by config limit'
  );
  reset role;

  -- Restore live defaults for later suites / seed consumers.
  update public.fight_quota_config
     set fight_limit = 3,
         scope = 'player',
         refill_policy = 'daily_utc_midnight',
         rolling_refill_seconds = 7200,
         updated_at = now()
   where id = true;
  update public.fight_allowances
     set used_at = null
   where account_id = v_account
     and utc_day = v_day;

  -- C17: player-facing payload must not embed account uuid.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_fight_allowance_summary();
  perform tests.assert(
    position(v_account::text in v_res::text) = 0,
    'C17: summary must not embed account id'
  );
  reset role;

  raise notice 'TEST-OK E3 fight quota summary';
end $$;

-- ---------------------------------------------------------------------------
-- D7 / E7: rename_owned_character (0034)
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_res jsonb;
  v_name text;
begin
  perform tests.assert(
    has_function_privilege(
      'authenticated',
      'public.rename_owned_character(text)',
      'EXECUTE'
    ),
    'authenticated EXECUTE rename_owned_character'
  );
  perform tests.assert(
    not has_function_privilege(
      'anon',
      'public.rename_owned_character(text)',
      'EXECUTE'
    ),
    'anon must not EXECUTE rename_owned_character'
  );
  perform tests.assert(
    not has_function_privilege(
      'service_role',
      'public.rename_owned_character(text)',
      'EXECUTE'
    ),
    'service_role must not EXECUTE rename_owned_character'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.rename_owned_character('Rivet');
  perform tests.assert((v_res->>'ok')::boolean, 'rename_owned_character ok');
  perform tests.assert(v_res->>'displayName' = 'Rivet', 'rename returns Rivet');

  v_res := public.get_owned_character();
  perform tests.assert(v_res->>'displayName' = 'Rivet', 'get_owned_character sees rename');
  reset role;

  -- Table assert as owner (no authenticated SELECT grant on characters).
  select c.display_name into v_name
    from public.characters c
   where c.account_id = v_account
     and c.is_opponent = false
   limit 1;
  perform tests.assert(v_name = 'Rivet', 'characters.display_name persisted');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.rename_owned_character('');
  perform tests.assert(v_res->>'ok' = 'false', 'empty name rejected');
  perform tests.assert(v_res->>'code' = 'invalid_display_name', 'empty name code');

  v_res := public.rename_owned_character('this-name-is-way-too-long');
  perform tests.assert(v_res->>'ok' = 'false', 'overlong name rejected');

  v_res := public.rename_owned_character('player-hero');
  perform tests.assert(v_res->>'ok' = 'false', 'internal id rejected');

  -- Restore seed display name so later API integration asserts still see "Hero".
  v_res := public.rename_owned_character('Hero');
  perform tests.assert((v_res->>'ok')::boolean, 'restore seed display name');
  perform tests.assert(v_res->>'displayName' = 'Hero', 'seed Hero restored');

  reset role;

  set local role anon;
  begin
    perform public.rename_owned_character('Anon');
    raise exception 'ANON FAIL: rename_owned_character allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  raise notice 'TEST-OK D7 rename_owned_character';
end $$;

-- =============================================================================
-- E4: multi-bot cap / create / select / list (0037)
-- =============================================================================
do $$
declare
  v_account uuid := 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee00e4';
  v_res jsonb;
  v_name text;
  v_id1 text;
  v_id2 text;
  v_id3 text;
  v_cap integer;
  v_active text;
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'e4-multibot@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  perform tests.assert(
    exists (select 1 from public.player_bot_config where id is true and bot_limit = 3),
    'player_bot_config default cap 3'
  );

  perform tests.assert(
    has_function_privilege('authenticated', 'public.list_owned_characters()', 'EXECUTE'),
    'authenticated EXECUTE list_owned_characters'
  );
  perform tests.assert(
    not has_function_privilege('anon', 'public.list_owned_characters()', 'EXECUTE'),
    'anon must not EXECUTE list_owned_characters'
  );
  perform tests.assert(
    has_function_privilege(
      'authenticated',
      'public.create_owned_character(text, text, text)',
      'EXECUTE'
    ),
    'authenticated EXECUTE create_owned_character'
  );
  perform tests.assert(
    has_function_privilege('authenticated', 'public.select_active_character(text)', 'EXECUTE'),
    'authenticated EXECUTE select_active_character'
  );
  perform tests.assert(
    has_function_privilege('authenticated', 'public.suggest_bot_name()', 'EXECUTE'),
    'authenticated EXECUTE suggest_bot_name'
  );
  perform tests.assert(
    not has_table_privilege('authenticated', 'public.player_bot_config', 'SELECT'),
    'authenticated has no SELECT on player_bot_config'
  );

  -- Cap TOCTOU: trigger + create must lock the account row before counting.
  perform tests.assert(
    pg_get_functiondef('public._enforce_player_bot_cap'::regproc) ~* 'for update',
    'cap trigger locks account for update'
  );
  perform tests.assert(
    pg_get_functiondef('public.create_owned_character(text, text, text)'::regprocedure)
      ~* 'for update',
    'create_owned_character locks account for update'
  );

  -- Word-boundary deny list: short stems must not reject Peacock / Grapes.
  perform tests.assert(
    (public._validate_bot_display_name('Peacock')->>'ok')::boolean,
    'Peacock allowed'
  );
  perform tests.assert(
    (public._validate_bot_display_name('Grapes')->>'ok')::boolean,
    'Grapes allowed'
  );
  perform tests.assert(
    public._validate_bot_display_name('dick')->>'ok' = 'false',
    'standalone dick rejected'
  );
  perform tests.assert(
    public._validate_bot_display_name('rape')->>'ok' = 'false',
    'standalone rape rejected'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  -- First list auto-provisions one bot via ensure.
  v_res := public.list_owned_characters();
  perform tests.assert((v_res->>'ok')::boolean, 'list_owned_characters auto-provisions');
  v_cap := (v_res->>'cap')::integer;
  perform tests.assert(v_cap = 3, 'list cap is 3');
  perform tests.assert((v_res->>'ownedCount')::integer = 1, 'first ownedCount is 1');
  v_id1 := v_res->'bots'->0->>'characterId';
  v_active := v_res->>'activeCharacterId';
  perform tests.assert(v_id1 is not null, 'first bot id');
  perform tests.assert(v_active = v_id1, 'active equals first bot');

  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'get_owned_character ok');
  perform tests.assert(v_res->>'characterId' = v_id1, 'get_owned matches active');

  v_res := public.suggest_bot_name();
  perform tests.assert((v_res->>'ok')::boolean, 'suggest_bot_name ok');
  v_name := v_res->>'displayName';
  perform tests.assert(char_length(v_name) between 1 and 12, 'suggested name length');

  v_res := public.create_owned_character(v_name, 'paint-cobalt', 'weapon-axe');
  perform tests.assert((v_res->>'ok')::boolean, 'create second bot ok');
  v_id2 := v_res->>'characterId';
  perform tests.assert(v_id2 is not null and v_id2 <> v_id1, 'second characterId distinct');
  perform tests.assert(v_res->>'displayName' = v_name, 'create keeps name');

  v_res := public.get_owned_character();
  perform tests.assert(v_res->>'characterId' = v_id2, 'create sets active');

  v_res := public.create_owned_character(v_name, 'paint-primer', 'weapon-sword');
  perform tests.assert(v_res->>'ok' = 'false', 'duplicate name rejected');
  perform tests.assert(v_res->>'code' = 'name_taken', 'duplicate name code');

  v_res := public.create_owned_character('player-hero', 'paint-crimson', 'weapon-sword');
  perform tests.assert(v_res->>'ok' = 'false', 'reserved name rejected');

  v_res := public.create_owned_character('fuck bot', 'paint-crimson', 'weapon-sword');
  perform tests.assert(v_res->>'ok' = 'false', 'profanity rejected');

  v_res := public.create_owned_character('', 'paint-crimson', 'weapon-sword');
  perform tests.assert(v_res->>'ok' = 'false', 'empty name rejected');

  -- Avoid probing characters as authenticated (no table SELECT).
  v_name := 'Tin Scout';
  v_res := public.list_owned_characters();
  if exists (
    select 1
      from jsonb_array_elements(coalesce(v_res->'bots', '[]'::jsonb)) b
     where lower(b->>'displayName') = lower(v_name)
  ) then
    v_name := 'Ash Hawk';
  end if;
  v_res := public.create_owned_character(v_name, 'paint-navy', 'weapon-dagger');
  perform tests.assert((v_res->>'ok')::boolean, 'create third bot ok');
  v_id3 := v_res->>'characterId';

  v_res := public.list_owned_characters();
  perform tests.assert((v_res->>'ownedCount')::integer = 3, 'ownedCount at cap');
  perform tests.assert(jsonb_array_length(v_res->'bots') = 3, 'bots array length 3');

  v_res := public.create_owned_character('Cap Breaker', 'paint-crimson', 'weapon-sword');
  perform tests.assert(v_res->>'ok' = 'false', 'fourth create rejected');
  perform tests.assert(v_res->>'code' = 'bot_cap_reached', 'fourth create code');

  v_res := public.select_active_character(v_id1);
  perform tests.assert((v_res->>'ok')::boolean, 'select first bot ok');
  v_res := public.get_owned_character();
  perform tests.assert(v_res->>'characterId' = v_id1, 'active persisted');

  v_res := public.select_active_character('opp-sir-bot');
  perform tests.assert(v_res->>'ok' = 'false', 'opponent select rejected');
  perform tests.assert(v_res->>'code' = 'not_owned', 'opponent select code');

  -- Cross-account isolation: seed hero cannot be selected by this account
  v_res := public.select_active_character('player-hero');
  perform tests.assert(v_res->>'ok' = 'false', 'cross-account select rejected');

  reset role;

  set local role anon;
  begin
    perform public.list_owned_characters();
    raise exception 'ANON FAIL: list_owned_characters allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.create_owned_character('Anon Bot', 'paint-crimson', 'weapon-sword');
    raise exception 'ANON FAIL: create_owned_character allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    perform public.select_active_character('player-hero');
    raise exception 'ANON FAIL: select_active_character allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  reset role;

  raise notice 'TEST-OK E4 multi_bot_cap';
end $$;

-- ---------------------------------------------------------------------------
-- 0038 Loadout Equip Fix: A6 inventory sync on hydrate + save
-- Cases: pre-A6 returning player; revoke stays unowned; active bot preserved
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-0000000000e8';
  v_character_id text := 'player-equip-e8';
  v_res jsonb;
  v_version uuid;
  v_loadout jsonb;
  v_qty integer;
  v_owned boolean;
  v_err text;
begin
  -- Isolated returning player: character + starter loadout, NO A6 inventory grants.
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'equip-e8@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.accounts (id) values (v_account)
  on conflict (id) do nothing;

  insert into public.characters (
    character_id, account_id, display_name, is_opponent, owner_is_npc
  ) values (
    v_character_id, v_account, 'Pilot', false, false
  ) on conflict (character_id) do nothing;

  update public.accounts
     set active_character_id = v_character_id
   where id = v_account;

  insert into public.character_build_versions (
    character_id, hp, strength, agility, speed, weapon_kind, weapon_power
  )
  select v_character_id, 30, 5, 5, 6, 'sword', 3
  where not exists (
    select 1 from public.character_build_versions where character_id = v_character_id
  );

  -- Minimal pre-A6 inventory only (crimson + sword + chassis).
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  select v_account, p.part_id, 1, 'grant'
  from (values
    ('chassis-basic'),
    ('paint-crimson'),
    ('weapon-sword')
  ) as p(part_id)
  where not exists (
    select 1 from public.inventory_ledger il
     where il.account_id = v_account
       and il.part_id = p.part_id
       and il.reason in ('grant', 'seed', 'admin', 'purchase')
       and il.delta > 0
  );

  insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
  select
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","shield":null,"drone":null,"decals":[],"soundTags":["chassis.light","weapon.sword"]}'::jsonb,
    'v1'
  where not exists (
    select 1 from public.current_bot_loadouts where character_id = v_character_id
  );

  select public.owned_part_quantity(v_account, 'weapon-mace') into v_qty;
  perform tests.assert(v_qty < 1, 'pre: weapon-mace must be unowned before sync');
  select public.owned_part_quantity(v_account, 'paint-hazard') into v_qty;
  perform tests.assert(v_qty < 1, 'pre: paint-hazard must be unowned before sync');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  -- Hydrate path: get_owned_character always ensures → grants A6 inventory.
  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'get_owned_character ok for returning player');
  perform tests.assert(v_res->>'characterId' = v_character_id, 'character id stable');
  reset role;

  select public.owned_part_quantity(v_account, 'weapon-mace') into v_qty;
  perform tests.assert(v_qty >= 1, 'hydrate grants weapon-mace');
  select public.owned_part_quantity(v_account, 'paint-hazard') into v_qty;
  perform tests.assert(v_qty >= 1, 'hydrate grants paint-hazard');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  -- Case 1: Equip new weapon (A6 now owned via ensure, not revoke-regrant)
  v_version := public.save_bot_loadout(
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-mace","soundTags":["chassis.light","weapon.mace"]}'::jsonb,
    'v1'
  );
  perform tests.assert(v_version is not null, 'equip weapon-mace returns version');
  reset role;
  select loadout into v_loadout
    from public.bot_loadout_versions
   where loadout_version_id = v_version;
  perform tests.assert(v_loadout->>'weapon' = 'weapon-mace', 'weapon-mace persisted');
  select loadout into v_loadout
    from public.current_bot_loadouts
   where character_id = v_character_id;
  perform tests.assert(v_loadout->>'weapon' = 'weapon-mace', 'current view shows weapon-mace');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  -- Case 2: Equip new paint v4
  v_version := public.save_bot_loadout(
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-hazard","weapon":"weapon-mace","soundTags":["chassis.light","weapon.mace"]}'::jsonb,
    'v1'
  );
  reset role;
  select loadout into v_loadout
    from public.bot_loadout_versions
   where loadout_version_id = v_version;
  perform tests.assert(v_loadout->>'paint' = 'paint-hazard', 'paint-hazard persisted');
  select loadout into v_loadout
    from public.current_bot_loadouts
   where character_id = v_character_id;
  perform tests.assert(v_loadout->>'paint' = 'paint-hazard', 'current view shows paint-hazard');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  -- Case 3: Equip after bot name was edited
  v_res := public.rename_owned_character('Rivet');
  perform tests.assert((v_res->>'ok')::boolean, 'rename before equip ok');
  perform tests.assert(v_res->>'displayName' = 'Rivet', 'rename Rivet');

  v_version := public.save_bot_loadout(
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-navy","weapon":"weapon-spear","soundTags":["chassis.light","weapon.spear"]}'::jsonb,
    'v1'
  );
  v_res := public.get_owned_character();
  perform tests.assert(v_res->>'displayName' = 'Rivet', 'name survives post-rename equip');
  reset role;

  select loadout into v_loadout
    from public.bot_loadout_versions
   where loadout_version_id = v_version;
  perform tests.assert(v_loadout->>'paint' = 'paint-navy', 'post-rename paint-navy persisted');
  perform tests.assert(v_loadout->>'weapon' = 'weapon-spear', 'post-rename weapon-spear persisted');
  select loadout into v_loadout
    from public.current_bot_loadouts
   where character_id = v_character_id;
  perform tests.assert(v_loadout->>'weapon' = 'weapon-spear', 'current view shows post-rename spear');

  select public.owned_part_quantity(v_account, 'weapon-spear') >= 1 into v_owned;
  perform tests.assert(v_owned, 'save path owned weapon-spear');

  -- B2: revoke stays effective — ensure must NOT regrant.
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  values (v_account, 'paint-hazard', -public.owned_part_quantity(v_account, 'paint-hazard'), 'revoke');
  select public.owned_part_quantity(v_account, 'paint-hazard') into v_qty;
  perform tests.assert(v_qty < 1, 'pre: paint-hazard revoked');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'hydrate after revoke ok');
  reset role;
  select public.owned_part_quantity(v_account, 'paint-hazard') into v_qty;
  perform tests.assert(v_qty < 1, 'revoked paint-hazard stays unowned after hydrate');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  begin
    v_version := public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-hazard","weapon":"weapon-spear","soundTags":["chassis.light","weapon.spear"]}'::jsonb,
      'v1'
    );
    perform tests.assert(false, 'equip revoked paint-hazard must raise unowned_part');
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      perform tests.assert(
        v_err ilike '%unowned_part%',
        'equip revoked paint-hazard raises unowned_part'
      );
  end;
  reset role;

  raise notice 'TEST-OK 0038 loadout equip A6 inventory sync (weapon/paint/after-rename/revoke)';
end $$;

-- ---------------------------------------------------------------------------
-- 0038 B1: get_owned_character returns the active (second) bot after select
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-0000000000e9';
  v_res jsonb;
  v_id1 text;
  v_id2 text;
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'equip-e9-active@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.accounts (id) values (v_account)
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'first hydrate provisions bot');
  v_id1 := v_res->>'characterId';
  perform tests.assert(v_id1 is not null and v_id1 <> '', 'first bot id');

  v_res := public.create_owned_character('Zed', 'paint-crimson', 'weapon-sword');
  perform tests.assert((v_res->>'ok')::boolean, 'create second bot Zed');
  v_id2 := v_res->>'characterId';
  perform tests.assert(v_id2 is not null and v_id2 <> v_id1, 'second bot distinct');

  v_res := public.select_active_character(v_id2);
  perform tests.assert((v_res->>'ok')::boolean, 'select second bot active');
  perform tests.assert(v_res->>'characterId' = v_id2, 'select returns second');

  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'get_owned_character after select ok');
  perform tests.assert(
    v_res->>'characterId' = v_id2,
    'get_owned_character returns active second bot (not first)'
  );
  reset role;

  raise notice 'TEST-OK 0038 get_owned_character preserves active second bot';
end $$;

-- ---------------------------------------------------------------------------
-- 0039 A4 shapes: catalogue slots, RLS, save defaults, Equip self-heal
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-0000000000ea';
  v_character_id text := 'player-shapes-ea';
  v_res jsonb;
  v_version uuid;
  v_loadout jsonb;
  v_qty integer;
  v_rows integer;
  v_err text;
begin
  -- Catalogue: 3 heads, 3 bodies, 2 arms, 2 legs; chassis stays its own slot.
  perform tests.assert(
    (select count(*) from public.parts_catalogue where slot_kind = 'head' and is_active) = 3,
    'expected 3 active heads'
  );
  perform tests.assert(
    (select count(*) from public.parts_catalogue where slot_kind = 'body' and is_active) = 3,
    'expected 3 active bodies'
  );
  perform tests.assert(
    (select count(*) from public.parts_catalogue where slot_kind = 'arms' and is_active) = 2,
    'expected 2 active arms'
  );
  perform tests.assert(
    (select count(*) from public.parts_catalogue where slot_kind = 'legs' and is_active) = 2,
    'expected 2 active legs'
  );
  perform tests.assert(
    (select slot_kind from public.parts_catalogue where part_id = 'body-chassis') = 'body'
    and (select slot_kind from public.parts_catalogue where part_id = 'chassis-basic') = 'chassis',
    'body-chassis is a body part; chassis-basic stays chassis'
  );

  -- Atlas v1 carries the 9 shape tiles × 4 layers (uploaded + published by db-reset).
  perform tests.assert(
    (
      select count(*) from public.atlas_manifest_entries
       where version = 'v1' and kind = 'image'
         and path ~ '^parts/(head-welder|head-can|torso-boiler|torso-slab|upper-arm-heavy|forearm-heavy|thigh-piston|shin-piston|foot-piston)/(oxide|material-under|material-over|mask)\.png$'
    ) = 36,
    'atlas v1 registers 36 A4 shape tile entries'
  );

  begin
    insert into public.parts_catalogue (part_id, slot_kind, display_name, media_key)
    values ('tail-bogus', 'tail', 'Bogus', 'parts/tail-bogus');
    perform tests.assert(false, 'slot_kind check must reject tail');
  exception
    when check_violation then null;
  end;

  -- RLS: clients cannot write shape catalogue rows or grant themselves shapes.
  set local role authenticated;
  begin
    insert into public.parts_catalogue (part_id, slot_kind, display_name, media_key)
    values ('head-hack', 'head', 'Hack', 'parts/head-hack');
    raise exception 'RLS FAIL: insert head into parts_catalogue allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    insert into public.inventory_ledger (account_id, part_id, delta, reason)
    values (v_account, 'head-welder', 1, 'grant');
    raise exception 'RLS FAIL: insert shape into inventory_ledger allowed';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlstate = '42501' then null; else raise; end if;
  end;
  begin
    update public.parts_catalogue set display_name = 'Hacked' where slot_kind = 'head';
    get diagnostics v_rows = row_count;
    perform tests.assert(v_rows = 0, 'RLS FAIL: shape catalogue update affected rows');
  exception
    when insufficient_privilege then null;
  end;
  reset role;

  -- Returning pre-A4 player: starter loadout without shapes, no shape inventory.
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'shapes-ea@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id) values (v_account) on conflict (id) do nothing;
  insert into public.characters (
    character_id, account_id, display_name, is_opponent, owner_is_npc
  ) values (
    v_character_id, v_account, 'Pilot', false, false
  ) on conflict (character_id) do nothing;
  update public.accounts set active_character_id = v_character_id where id = v_account;
  insert into public.character_build_versions (
    character_id, hp, strength, agility, speed, weapon_kind, weapon_power
  )
  select v_character_id, 30, 5, 5, 6, 'sword', 3
  where not exists (
    select 1 from public.character_build_versions where character_id = v_character_id
  );
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  select v_account, p.part_id, 1, 'grant'
  from (values ('chassis-basic'), ('paint-crimson'), ('weapon-sword')) as p(part_id)
  where not exists (
    select 1 from public.inventory_ledger il
     where il.account_id = v_account and il.part_id = p.part_id and il.delta > 0
  );
  insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
  select
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","shield":null,"drone":null,"decals":[],"soundTags":["chassis.light","weapon.sword"]}'::jsonb,
    'v1'
  where not exists (
    select 1 from public.current_bot_loadouts where character_id = v_character_id
  );

  select public.owned_part_quantity(v_account, 'head-welder') into v_qty;
  perform tests.assert(v_qty < 1, 'pre: head-welder unowned before sync');

  -- Equip a pre-A4 loadout (no shape keys): ensure grants shapes, stock defaults stored.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_version := public.save_bot_loadout(
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-cobalt","weapon":"weapon-sword"}'::jsonb,
    'v1'
  );
  reset role;
  select loadout into v_loadout from public.bot_loadout_versions
   where loadout_version_id = v_version;
  perform tests.assert(v_loadout->>'paint' = 'paint-cobalt', 'old-shape save keeps paint');
  perform tests.assert(v_loadout->>'chassis' = 'chassis-basic', 'chassis untouched by shapes');
  perform tests.assert(
    v_loadout->>'head' = 'head-visor'
    and v_loadout->>'body' = 'body-chassis'
    and v_loadout->>'arms' = 'arms-stock'
    and v_loadout->>'legs' = 'legs-stock',
    'missing shapes default to stock ids'
  );
  select public.owned_part_quantity(v_account, 'legs-piston') into v_qty;
  perform tests.assert(v_qty >= 1, 'Equip self-heals legs-piston ownership');

  -- Equip the heaviest combo; explicit null head falls back to stock.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_version := public.save_bot_loadout(
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-axe","head":"head-welder","body":"body-boiler","arms":"arms-heavy","legs":"legs-piston"}'::jsonb,
    'v1'
  );
  reset role;
  select loadout into v_loadout from public.current_bot_loadouts
   where character_id = v_character_id;
  perform tests.assert(v_loadout->>'head' = 'head-welder', 'head-welder persisted');
  perform tests.assert(v_loadout->>'body' = 'body-boiler', 'body-boiler persisted');
  perform tests.assert(v_loadout->>'arms' = 'arms-heavy', 'arms-heavy persisted');
  perform tests.assert(v_loadout->>'legs' = 'legs-piston', 'legs-piston persisted');
  perform tests.assert(
    v_loadout->'soundTags' = '["chassis.light","weapon.axe"]'::jsonb,
    'shapes add no sound tags'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_version := public.save_bot_loadout(
    v_character_id,
    '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-axe","head":null,"body":"body-slab"}'::jsonb,
    'v1'
  );
  reset role;
  select loadout into v_loadout from public.bot_loadout_versions
   where loadout_version_id = v_version;
  perform tests.assert(
    v_loadout->>'head' = 'head-visor' and v_loadout->>'body' = 'body-slab'
    and v_loadout->>'legs' = 'legs-stock',
    'null head → stock; omitted legs → stock; body-slab kept'
  );

  -- Slot mismatch + non-string shapes are rejected.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  begin
    perform public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","head":"body-boiler"}'::jsonb,
      'v1'
    );
    perform tests.assert(false, 'body part in head slot must raise slot_mismatch');
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      perform tests.assert(v_err like 'slot_mismatch%', 'head slot rejects body-boiler');
  end;
  begin
    perform public.save_bot_loadout(
      v_character_id,
      '{"chassis":"body-chassis","paint":"paint-crimson","weapon":"weapon-sword"}'::jsonb,
      'v1'
    );
    perform tests.assert(false, 'body-chassis in chassis slot must raise slot_mismatch');
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      perform tests.assert(v_err like 'slot_mismatch%', 'chassis slot rejects body-chassis');
  end;
  begin
    perform public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","arms":3}'::jsonb,
      'v1'
    );
    perform tests.assert(false, 'numeric arms must raise invalid_loadout');
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      perform tests.assert(
        v_err like 'invalid_loadout: arms must be a string or null%',
        'non-string arms rejected'
      );
  end;
  reset role;

  -- Revoke stays effective: ensure must not regrant a revoked shape.
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  values (v_account, 'head-can', -public.owned_part_quantity(v_account, 'head-can'), 'revoke');
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'hydrate after shape revoke ok');
  begin
    perform public.save_bot_loadout(
      v_character_id,
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword","head":"head-can"}'::jsonb,
      'v1'
    );
    perform tests.assert(false, 'equip revoked head-can must raise unowned_part');
  exception
    when others then
      get stacked diagnostics v_err = message_text;
      perform tests.assert(v_err ilike '%unowned_part%', 'revoked head-can raises unowned_part');
  end;
  reset role;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  raise notice 'TEST-OK 0039 A4 shapes catalogue + save_bot_loadout defaults + equip self-heal';
end $$;

-- ---------------------------------------------------------------------------
-- 0039: brand-new player starter loadout carries stock shapes
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-0000000000eb';
  v_res jsonb;
  v_loadout jsonb;
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'shapes-eb@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  reset role;
  perform tests.assert((v_res->>'ok')::boolean, 'first hydrate provisions bot');

  select loadout into v_loadout from public.current_bot_loadouts
   where character_id = v_res->>'characterId';
  perform tests.assert(
    v_loadout->>'head' = 'head-visor'
    and v_loadout->>'body' = 'body-chassis'
    and v_loadout->>'arms' = 'arms-stock'
    and v_loadout->>'legs' = 'legs-stock',
    'starter loadout carries stock shapes'
  );
  perform tests.assert(
    public.owned_part_quantity(v_account, 'body-boiler') >= 1
    and public.owned_part_quantity(v_account, 'arms-heavy') >= 1,
    'new player owns shape variants'
  );

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  raise notice 'TEST-OK 0039 starter loadout stock shapes';
end $$;

-- ---------------------------------------------------------------------------
-- 0039 B1: shape backfill is once per account (multi-bot must not duplicate)
-- Simulates hosted apply after a 2-bot account exists with no shape grants.
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-0000000000ec';
  v_character_id text;
  v_res jsonb;
  v_grants int;
  v_qty int;
  v_dupes int;
  v_shape text;
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'shapes-ec@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.get_owned_character();
  perform tests.assert((v_res->>'ok')::boolean, 'B1 hydrate provisions first bot');
  v_character_id := v_res->>'characterId';
  perform tests.assert(v_character_id is not null and v_character_id <> '', 'B1 first characterId');
  v_res := public.create_owned_character('Shape Twin', 'paint-cobalt', 'weapon-axe');
  perform tests.assert((v_res->>'ok')::boolean, 'B1 second bot created');
  perform tests.assert((v_res->>'ownedCount')::integer = 2, 'B1 ownedCount is 2');
  reset role;

  -- Wipe shape ledger rows so the migration backfill statement can be re-run.
  delete from public.inventory_ledger
   where account_id = v_account
     and part_id in (
       'head-visor', 'head-welder', 'head-can',
       'body-chassis', 'body-boiler', 'body-slab',
       'arms-stock', 'arms-heavy',
       'legs-stock', 'legs-piston'
     );

  -- Same INSERT as 0039 backfill (account-scoped, not per character).
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  select a.id, p.part_id, 1, 'grant'
  from public.accounts a
  cross join (
    values
      ('head-visor'),
      ('head-welder'),
      ('head-can'),
      ('body-chassis'),
      ('body-boiler'),
      ('body-slab'),
      ('arms-stock'),
      ('arms-heavy'),
      ('legs-stock'),
      ('legs-piston')
  ) as p(part_id)
  where a.deleted_at is null
    and a.id = v_account
    and exists (
      select 1 from public.characters c
       where c.account_id = a.id
         and c.is_opponent = false
    )
    and exists (
      select 1 from public.parts_catalogue pc
       where pc.part_id = p.part_id and pc.is_active
    )
    and not exists (
      select 1 from public.inventory_ledger il
       where il.account_id = a.id
         and il.part_id = p.part_id
         and il.reason in ('grant', 'seed', 'admin', 'purchase')
         and il.delta > 0
    );

  -- Re-run: still one grant per shape.
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  select a.id, p.part_id, 1, 'grant'
  from public.accounts a
  cross join (
    values
      ('head-visor'),
      ('head-welder'),
      ('head-can'),
      ('body-chassis'),
      ('body-boiler'),
      ('body-slab'),
      ('arms-stock'),
      ('arms-heavy'),
      ('legs-stock'),
      ('legs-piston')
  ) as p(part_id)
  where a.deleted_at is null
    and a.id = v_account
    and exists (
      select 1 from public.characters c
       where c.account_id = a.id
         and c.is_opponent = false
    )
    and exists (
      select 1 from public.parts_catalogue pc
       where pc.part_id = p.part_id and pc.is_active
    )
    and not exists (
      select 1 from public.inventory_ledger il
       where il.account_id = a.id
         and il.part_id = p.part_id
         and il.reason in ('grant', 'seed', 'admin', 'purchase')
         and il.delta > 0
    );

  foreach v_shape in array array[
    'head-visor', 'head-welder', 'head-can',
    'body-chassis', 'body-boiler', 'body-slab',
    'arms-stock', 'arms-heavy',
    'legs-stock', 'legs-piston'
  ]
  loop
    select count(*) into v_grants
      from public.inventory_ledger
     where account_id = v_account
       and part_id = v_shape
       and reason in ('grant', 'seed', 'admin', 'purchase')
       and delta > 0;
    perform tests.assert(
      v_grants = 1,
      format('B1 exactly one positive grant for %s (got %s)', v_shape, v_grants)
    );
  end loop;

  -- One revoke clears ownership (would fail if duplicate grants left qty ≥ 1).
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  values (v_account, 'head-can', -1, 'revoke');
  v_qty := public.owned_part_quantity(v_account, 'head-can');
  perform tests.assert(v_qty = 0, format('B1 qty 0 after one revoke (got %s)', v_qty));

  -- Seeded / CI invariant: no account has duplicate positive shape grants.
  select count(*) into v_dupes
    from (
      select il.account_id, il.part_id
        from public.inventory_ledger il
       where il.part_id in (
               'head-visor', 'head-welder', 'head-can',
               'body-chassis', 'body-boiler', 'body-slab',
               'arms-stock', 'arms-heavy',
               'legs-stock', 'legs-piston'
             )
         and il.reason in ('grant', 'seed', 'admin', 'purchase')
         and il.delta > 0
       group by il.account_id, il.part_id
      having count(*) > 1
    ) d;
  perform tests.assert(v_dupes = 0, format('B1 no duplicate shape grants in DB (got %s)', v_dupes));

  -- M1: list_owned_characters returns shape slots after Equip.
  -- Re-grant head-can (revoked above) as postgres — authenticated cannot SELECT characters.
  insert into public.inventory_ledger (account_id, part_id, delta, reason)
  values (v_account, 'head-can', 1, 'admin');
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  perform public.save_bot_loadout(
    v_character_id,
    jsonb_build_object(
      'chassis', 'chassis-basic',
      'paint', 'paint-crimson',
      'weapon', 'weapon-sword',
      'head', 'head-welder',
      'body', 'body-boiler',
      'arms', 'arms-heavy',
      'legs', 'legs-piston'
    ),
    'v1'
  );
  v_res := public.list_owned_characters();
  reset role;
  perform tests.assert((v_res->>'ok')::boolean, 'M1 list_owned_characters ok');
  perform tests.assert(
    exists (
      select 1 from jsonb_array_elements(v_res->'bots') b
       where b->>'head' = 'head-welder'
         and b->>'body' = 'body-boiler'
         and b->>'arms' = 'arms-heavy'
         and b->>'legs' = 'legs-piston'
    ),
    'M1 list_owned_characters returns equipped shapes'
  );

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  raise notice 'TEST-OK 0039 B1 account-scoped backfill + M1 list shapes';
end $$;

-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 0040 prepare_fight_context uses active_character_id (BT-272)
-- Select non-first bot → prepare attacker + persist record on that bot only.
-- ---------------------------------------------------------------------------
do $$
declare
  v_account uuid := '00000000-0000-4000-8000-0000000000f2';
  v_id1 text;
  v_id2 text;
  v_name1 text := 'Gaskiller';
  v_name2 text := 'Ash Crown';
  v_res jsonb;
  v_ctx jsonb;
  v_atk_loadout uuid;
  v_def_loadout uuid;
  v_battle uuid;
  v_seed text := repeat('27', 16);
  v_checksum text := repeat('a1', 32);
  v_input_hash text := repeat('b2', 32);
  v_replay jsonb;
  v_attacker jsonb;
  v_defender jsonb;
  v_day date := (now() at time zone 'utc')::date;
  v_key text := 'bt272-selected-bot-fight';
  v_wins1 int;
  v_wins2 int;
  v_losses1 int;
  v_losses2 int;
  v_ledger2 int;
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (
    v_account,
    'bt272-selected@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
  on conflict (id) do nothing;
  insert into public.accounts (id) values (v_account)
  on conflict (id) do nothing;

  insert into public.fight_allowances (account_id, utc_day, slot_index)
  select v_account, v_day, s
    from generate_series(1, 3) as s
  on conflict do nothing;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;

  -- Auto-provision first bot + inventory (same as E4 list path).
  v_res := public.list_owned_characters();
  perform tests.assert((v_res->>'ok')::boolean, 'BT-272 list auto-provisions');
  perform tests.assert((v_res->>'ownedCount')::integer >= 1, 'BT-272 has first bot');
  v_id1 := v_res->'bots'->0->>'characterId';
  perform tests.assert(v_id1 is not null, 'BT-272 first bot id');

  v_res := public.rename_owned_character(v_name1);
  perform tests.assert((v_res->>'ok')::boolean, 'BT-272 rename first to Gaskiller');

  v_res := public.create_owned_character(v_name2, 'paint-cobalt', 'weapon-axe');
  perform tests.assert((v_res->>'ok')::boolean, 'BT-272 create Ash Crown');
  v_id2 := v_res->>'characterId';
  perform tests.assert(v_id2 is not null and v_id2 <> v_id1, 'BT-272 second distinct');

  -- Flip active to first, then Ash Crown, proving select drives prepare_fight_context.
  v_res := public.select_active_character(v_id1);
  perform tests.assert((v_res->>'ok')::boolean, 'BT-272 select first');
  reset role;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  v_ctx := public.prepare_fight_context(v_account, 'opp-sir-bot');
  perform tests.assert((v_ctx->>'ok')::boolean, 'BT-272 prepare on first ok');
  perform tests.assert(v_ctx->'attacker'->>'characterId' = v_id1, 'BT-272 attacker is first when active');
  perform tests.assert(v_ctx->'attacker'->>'displayName' = v_name1, 'BT-272 attacker name first');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_account::text, true);
  set local role authenticated;
  v_res := public.select_active_character(v_id2);
  perform tests.assert((v_res->>'ok')::boolean, 'BT-272 select Ash Crown');
  reset role;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  v_ctx := public.prepare_fight_context(v_account, 'opp-sir-bot');
  perform tests.assert((v_ctx->>'ok')::boolean, 'BT-272 prepare on Ash Crown ok');
  perform tests.assert(
    v_ctx->'attacker'->>'characterId' = v_id2,
    'BT-272 attacker is Ash Crown when selected (not first bot)'
  );
  perform tests.assert(
    v_ctx->'attacker'->>'displayName' = v_name2,
    'BT-272 attacker displayName is Ash Crown'
  );

  select loadout_version_id into v_atk_loadout
    from public.current_bot_loadouts where character_id = v_id2;
  select loadout_version_id into v_def_loadout
    from public.current_bot_loadouts where character_id = 'opp-sir-bot';
  perform tests.assert(v_atk_loadout is not null, 'BT-272 Ash Crown loadout');

  select coalesce(max(wins), 0), coalesce(max(losses), 0) into v_wins1, v_losses1
    from public.bot_fight_records where character_id = v_id1;
  select coalesce(max(wins), 0), coalesce(max(losses), 0) into v_wins2, v_losses2
    from public.bot_fight_records where character_id = v_id2;

  v_attacker := jsonb_build_object(
    'characterId', v_id2,
    'hp', 30,
    'weaponKind', 'axe',
    'weaponPower', 5,
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
      jsonb_build_object('characterId', v_id2, 'displayName', v_name2, 'hp', 30),
      jsonb_build_object('characterId', 'opp-sir-bot', 'displayName', 'Rivet Nan', 'hp', 34)
    ),
    'events', jsonb_build_array(
      jsonb_build_object('type', 'battle_started', 'tick', 0),
      jsonb_build_object(
        'type', 'damage_applied', 'tick', 1,
        'target', 'opp-sir-bot', 'targetHpAfter', 0
      )
    ),
    'outcome', jsonb_build_object(
      'winner', v_id2,
      'loser', 'opp-sir-bot',
      'reason', 'defeat'
    ),
    'checksum', v_checksum
  );

  v_res := public.persist_fight_result(
    v_account, v_key, 'opp-sir-bot', v_battle, v_seed, 'combat-v1',
    v_replay, v_attacker, v_defender, v_day
  );
  perform tests.assert(
    (v_res->>'ok')::boolean,
    format('BT-272 persist ok (got %s)', coalesce(v_res->>'code', v_res::text))
  );

  select count(*) into v_ledger2
    from public.progression_ledger
   where account_id = v_account and battle_id = v_battle and character_id = v_id2;
  perform tests.assert(v_ledger2 = 1, 'BT-272 ledger on Ash Crown only');

  perform tests.assert(
    not exists (
      select 1 from public.progression_ledger
       where account_id = v_account and battle_id = v_battle and character_id = v_id1
    ),
    'BT-272 no ledger on first bot'
  );

  perform tests.assert(
    exists (
      select 1 from public.battle_participants
       where battle_id = v_battle and character_id = v_id2 and side = 'attacker'
    ),
    'BT-272 battle_participants attacker is Ash Crown'
  );

  perform tests.assert(
    coalesce((select wins from public.bot_fight_records where character_id = v_id1), 0) = v_wins1
    and coalesce((select losses from public.bot_fight_records where character_id = v_id1), 0) = v_losses1,
    'BT-272 first bot W-L unchanged'
  );
  perform tests.assert(
    coalesce((select wins from public.bot_fight_records where character_id = v_id2), 0) = v_wins2 + 1,
    'BT-272 Ash Crown wins incremented'
  );

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  raise notice 'TEST-OK 0040 prepare_fight active_character BT-272';
end $$;
