-- 0032: E3 server-driven fight quota (ClickUp 1amjtrezeba)
-- (0031 reserved by atlas v1 consolidation on #81)
--
-- Extends get_fight_allowance_summary() with a config-backed player-facing
-- contract: fightsRemaining, limit, scope, refillPolicy, nextRefillAt.
-- Default live policy remains daily UTC midnight / 3 / player.
-- rolling_per_fight is selectable via config for fixtures without breaking
-- the daily path. Client must not hard-code limit or reset copy.
--
-- Compat: keeps utcDay + allowancesRemaining (= fightsRemaining).
-- No table GRANT to authenticated — config is read only inside the RPC.
-- Carlos yes required before merge (new migration).

-- ---------------------------------------------------------------------------
-- Config singleton (service / postgres writable; client reads via RPC only)
-- ---------------------------------------------------------------------------
create table if not exists public.fight_quota_config (
    id boolean primary key default true check (id),
    fight_limit integer not null
        check (fight_limit >= 1 and fight_limit <= 24),
    scope text not null
        check (scope in ('player', 'bot')),
    refill_policy text not null
        check (refill_policy in ('daily_utc_midnight', 'rolling_per_fight')),
    -- Used when refill_policy = rolling_per_fight (seconds after a consumed fight).
    rolling_refill_seconds integer not null default 7200
        check (rolling_refill_seconds >= 60 and rolling_refill_seconds <= 604800),
    updated_at timestamptz not null default now()
);

comment on table public.fight_quota_config is
  'E3: singleton fight quota policy (limit/scope/refill). Client reads via get_fight_allowance_summary only.';

comment on column public.fight_quota_config.fight_limit is
  'Max fights in the current window (3 now; may grow without an app ship).';

comment on column public.fight_quota_config.scope is
  'player = per account (now); bot = per character (later).';

comment on column public.fight_quota_config.refill_policy is
  'daily_utc_midnight (live default) or rolling_per_fight (contract + fixtures).';

insert into public.fight_quota_config (
    id, fight_limit, scope, refill_policy, rolling_refill_seconds
) values (
    true, 3, 'player', 'daily_utc_midnight', 7200
)
on conflict (id) do nothing;

alter table public.fight_quota_config enable row level security;

revoke all on table public.fight_quota_config from public;
revoke all on table public.fight_quota_config from anon;
revoke all on table public.fight_quota_config from authenticated;
-- service_role / postgres retain access for fixtures + admin.

-- ---------------------------------------------------------------------------
-- next_refill_at helper (pure relative to now + config + optional used_at)
-- ---------------------------------------------------------------------------
create or replace function public.fight_quota_next_refill_at(
    p_policy text,
    p_rolling_seconds integer,
    p_now timestamptz,
    p_earliest_used_at timestamptz
) returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
    v_utc_midnight timestamptz;
begin
    if p_policy = 'rolling_per_fight' then
        if p_earliest_used_at is not null then
            return p_earliest_used_at + make_interval(secs => greatest(p_rolling_seconds, 60));
        end if;
        -- No consumed fight yet under rolling: next refill is a full interval from now
        -- (fixture-friendly; live daily path does not use this branch).
        return p_now + make_interval(secs => greatest(p_rolling_seconds, 60));
    end if;

    -- daily_utc_midnight: end of current UTC day (= start of next UTC day)
    v_utc_midnight :=
        ((p_now at time zone 'utc')::date + 1)::timestamp at time zone 'utc';
    return v_utc_midnight;
end;
$$;

comment on function public.fight_quota_next_refill_at(text, integer, timestamptz, timestamptz) is
  'E3: compute next_refill_at for daily_utc_midnight or rolling_per_fight.';

revoke all on function public.fight_quota_next_refill_at(text, integer, timestamptz, timestamptz) from public;
revoke all on function public.fight_quota_next_refill_at(text, integer, timestamptz, timestamptz) from anon;
revoke all on function public.fight_quota_next_refill_at(text, integer, timestamptz, timestamptz) from authenticated;
grant execute on function public.fight_quota_next_refill_at(text, integer, timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Extended get_fight_allowance_summary — auth.uid() only
-- ---------------------------------------------------------------------------
create or replace function public.get_fight_allowance_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_now timestamptz := now();
    v_utc_day date := (v_now at time zone 'utc')::date;
    v_remaining integer;
    v_limit integer;
    v_scope text;
    v_policy text;
    v_rolling integer;
    v_earliest_used timestamptz;
    v_next_refill timestamptz;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: get_fight_allowance_summary requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select c.fight_limit, c.scope, c.refill_policy, c.rolling_refill_seconds
      into v_limit, v_scope, v_policy, v_rolling
      from public.fight_quota_config c
     where c.id = true;

    if v_limit is null then
        -- Fail closed to the historical default rather than inventing client constants.
        v_limit := 3;
        v_scope := 'player';
        v_policy := 'daily_utc_midnight';
        v_rolling := 7200;
    end if;

    if v_policy = 'rolling_per_fight' then
        -- Rolling window: unused slots that still exist, capped by config limit.
        -- Slot rows remain the consume surface; config drives remaining/limit/refill.
        select count(*)::integer
          into v_remaining
          from public.fight_allowances fa
         where fa.account_id = v_caller
           and fa.utc_day = v_utc_day
           and fa.used_at is null;

        select min(fa.used_at)
          into v_earliest_used
          from public.fight_allowances fa
         where fa.account_id = v_caller
           and fa.utc_day = v_utc_day
           and fa.used_at is not null;
    else
        -- daily_utc_midnight: unused slots for the current UTC day.
        select count(*)::integer
          into v_remaining
          from public.fight_allowances fa
         where fa.account_id = v_caller
           and fa.utc_day = v_utc_day
           and fa.used_at is null;

        v_earliest_used := null;
    end if;

    v_remaining := least(coalesce(v_remaining, 0), v_limit);

    v_next_refill := public.fight_quota_next_refill_at(
        v_policy,
        v_rolling,
        v_now,
        v_earliest_used
    );

    -- Player-facing payload only (C17): no account/character ids.
    return jsonb_build_object(
        'ok', true,
        'fightsRemaining', v_remaining,
        'limit', v_limit,
        'scope', v_scope,
        'refillPolicy', v_policy,
        'nextRefillAt', to_char(v_next_refill at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        -- Compat with pre-E3 clients / prepare_fight_context consumers:
        'utcDay', v_utc_day,
        'allowancesRemaining', v_remaining
    );
end;
$$;

comment on function public.get_fight_allowance_summary() is
  'E3 sanctioned client read: {fightsRemaining,limit,scope,refillPolicy,nextRefillAt,utcDay,allowancesRemaining} for auth.uid(). EXECUTE authenticated only. No table GRANT.';

revoke all on function public.get_fight_allowance_summary() from public;
revoke all on function public.get_fight_allowance_summary() from anon;
revoke all on function public.get_fight_allowance_summary() from service_role;
grant execute on function public.get_fight_allowance_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- ensure_fight_allowances — slot count from fight_quota_config.fight_limit
-- (was hard-coded 1..3 in 0016; E3 server-side config must drive issuance)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_fight_allowances(
    p_horizon_days integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text := coalesce(auth.role(), '');
    v_today date := (now() at time zone 'utc')::date;
    v_inserted integer := 0;
    v_limit integer;
begin
    if v_role is distinct from 'service_role'
       and current_user not in ('postgres', 'supabase_admin') then
        raise exception 'ensure_fight_allowances requires service_role'
            using errcode = '42501';
    end if;

    if p_horizon_days is null or p_horizon_days < 0 or p_horizon_days > 14 then
        raise exception 'p_horizon_days must be between 0 and 14';
    end if;

    select c.fight_limit into v_limit
      from public.fight_quota_config c
     where c.id = true;
    if v_limit is null then
        v_limit := 3;
    end if;

    with candidates as (
        select a.id as account_id, d::date as utc_day, s.slot_index
          from public.accounts a
          cross join generate_series(
              v_today,
              v_today + p_horizon_days,
              interval '1 day'
          ) as d
          cross join generate_series(1, v_limit) as s(slot_index)
    ),
    ins as (
        insert into public.fight_allowances (account_id, utc_day, slot_index)
        select account_id, utc_day, slot_index from candidates
        on conflict (account_id, utc_day, slot_index) do nothing
        returning 1
    )
    select count(*)::integer into v_inserted from ins;

    return jsonb_build_object(
        'ok', true,
        'inserted', v_inserted,
        'horizonDays', p_horizon_days,
        'fromDay', v_today,
        'toDay', v_today + p_horizon_days,
        'fightLimit', v_limit
    );
end;
$$;

comment on function public.ensure_fight_allowances(integer) is
  'F4/E3: idempotent create of fight_quota_config.fight_limit slots per account for today..today+horizon (UTC).';

revoke all on function public.ensure_fight_allowances(integer) from public;
revoke all on function public.ensure_fight_allowances(integer) from anon;
revoke all on function public.ensure_fight_allowances(integer) from authenticated;
grant execute on function public.ensure_fight_allowances(integer) to service_role;
