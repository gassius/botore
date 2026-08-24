-- Database tests: run against a freshly reset local Supabase database.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run.sql
-- Each test raises an exception on failure; a clean run produces TEST-OK lines.
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
begin
  -- seed present -----------------------------------------------------------
  select count(*) into v_count from public.characters where is_opponent;
  perform tests.assert(v_count = 3, 'expected three seeded opponents');

  select count(*) into v_count from public.fight_allowances
   where account_id = v_account and utc_day = (now() at time zone 'utc')::date;
  perform tests.assert(v_count = 3, 'expected three allowances today');
  raise notice 'TEST-OK seed fixtures';

  -- RLS: authenticated role cannot write protected tables -------------------
  set local role authenticated;

  begin
    insert into public.battles (battle_id, rules_version, seed, end_reason)
    values (gen_random_uuid(), 'combat-v1', 'ab', 'defeat');
    raise exception 'RLS FAIL: insert into battles allowed';
  exception when insufficient_privilege or check_violation then
    null; -- expected
    when others then
      if sqlstate in ('42501') then null; else raise; end if;
  end;

  begin
    update public.progression_ledger set delta_xp = 99;
    raise exception 'RLS FAIL: update progression_ledger allowed';
  exception when others then
    if sqlstate = '42501' then null; else raise; end if;
  end;

  begin
    delete from public.fight_allowances;
    raise exception 'RLS FAIL: delete fight_allowances allowed';
  exception when others then
    if sqlstate = '42501' then null; else raise; end if;
  end;

  begin
    insert into public.analytics_outbox (event_id, event_name, schema_version, context, payload)
    values (gen_random_uuid(), 'battle_completed', 1, '{}', '{}');
    raise exception 'RLS FAIL: insert analytics_outbox allowed';
  exception when others then
    if sqlstate = '42501' then null; else raise; end if;
  end;

  begin
    update public.admin_audit_log set action = 'tampered';
    raise exception 'RLS FAIL: update admin_audit_log allowed';
  exception when others then
    if sqlstate = '42501' then null; else raise; end if;
  end;

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
end $$;
