-- 0018: B2 admin dashboard read APIs (views + RPCs) — no UI
--
-- Completes the backend contract a future apps/dashboard can SELECT/RPC
-- without inventing ad-hoc SQL. Surfaces:
--   * players / bots / fight aggregates
--   * pg_cron run history (alongside existing admin_list_cron_jobs)
--   * pack/atlas versions (alongside admin_atlas_overview from F5)
--   * one aggregated admin_dashboard_snapshot() for a single poll
--
-- Non-goals: Next.js pages, Vercel UI, Fastify, client writes.

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------
create or replace view public.admin_players_overview
with (security_invoker = true) as
select
    a.id as account_id,
    p.display_name,
    a.created_at as account_created_at,
    c.character_id,
    c.display_name as character_display_name,
    (cl.character_id is not null) as has_confirmed_loadout,
    cl.atlas_version as loadout_atlas_version,
    coalesce(fa.remaining_today, 0) as allowances_remaining_today,
    coalesce(fa.total_today, 0) as allowances_total_today,
    coalesce(fa.used_today, 0) as allowances_used_today,
    coalesce(bf.battles_initiated, 0) as battles_initiated,
    coalesce(bf.battles_won_as_attacker, 0) as battles_won_as_attacker,
    coalesce(xp.total_xp, 0) as total_xp,
    bf.last_battle_at
from public.accounts a
left join public.profiles p on p.account_id = a.id
left join public.characters c
  on c.account_id = a.id and c.is_opponent = false
left join public.current_bot_loadouts cl on cl.character_id = c.character_id
left join lateral (
    select
        count(*) filter (where used_at is null)::integer as remaining_today,
        count(*)::integer as total_today,
        count(*) filter (where used_at is not null)::integer as used_today
      from public.fight_allowances fa
     where fa.account_id = a.id
       and fa.utc_day = (now() at time zone 'utc')::date
) fa on true
left join lateral (
    select
        count(*)::integer as battles_initiated,
        count(*) filter (
            where b.winner_id = b.initiator_account_character
        )::integer as battles_won_as_attacker,
        max(b.ended_at) as last_battle_at
      from public.battles b
     where b.initiator_account_id = a.id
) bf on true
left join lateral (
    select coalesce(sum(pl.delta_xp), 0)::integer as total_xp
      from public.progression_ledger pl
     where pl.account_id = a.id
) xp on true
order by a.created_at;

revoke all on table public.admin_players_overview from public;
revoke all on table public.admin_players_overview from anon;
revoke all on table public.admin_players_overview from authenticated;
grant select on public.admin_players_overview to service_role;

comment on view public.admin_players_overview is
  'Admin/ops player roster for future B2 dashboard (service_role only).';

-- ---------------------------------------------------------------------------
-- Bots (player + opponent characters)
-- ---------------------------------------------------------------------------
create or replace view public.admin_bots_overview
with (security_invoker = true) as
select
    c.character_id,
    c.display_name,
    c.is_opponent,
    c.account_id,
    p.display_name as account_display_name,
    c.created_at as character_created_at,
    cb.hp,
    cb.strength,
    cb.agility,
    cb.speed,
    cb.weapon_kind as build_weapon_kind,
    cb.weapon_power as build_weapon_power,
    cl.loadout_version_id,
    cl.atlas_version,
    cl.loadout,
    cl.created_at as loadout_confirmed_at,
    fr.readiness,
    fr.allowances_remaining_today
from public.characters c
left join public.profiles p on p.account_id = c.account_id
left join public.current_character_builds cb using (character_id)
left join public.current_bot_loadouts cl using (character_id)
left join public.admin_fight_readiness fr using (character_id)
order by c.is_opponent, c.character_id;

revoke all on table public.admin_bots_overview from public;
revoke all on table public.admin_bots_overview from anon;
revoke all on table public.admin_bots_overview from authenticated;
grant select on public.admin_bots_overview to service_role;

comment on view public.admin_bots_overview is
  'Admin/ops bot roster (builds + loadouts + readiness); service_role only.';

-- ---------------------------------------------------------------------------
-- Fight aggregates (replaces ad-hoc dashboard SQL)
-- ---------------------------------------------------------------------------
create or replace view public.admin_fight_stats
with (security_invoker = true) as
select
    (select count(*)::integer from public.battles) as total_battles,
    (select count(*)::integer from public.battles
      where utc_day = (now() at time zone 'utc')::date) as battles_today,
    (
      select case
        when count(*) = 0 then null
        else round(
          (count(*) filter (
             where winner_id is not null
               and winner_id = initiator_account_character
           ))::numeric / count(*)::numeric,
          4
        )
      end
      from public.battles
    ) as initiator_win_rate,
    (
      select case
        when count(*) = 0 then null
        else round(
          (count(*) filter (where used_at is not null))::numeric / count(*)::numeric,
          4
        )
      end
      from public.fight_allowances
     where utc_day = (now() at time zone 'utc')::date
    ) as allowance_utilization_today,
    (
      select case
        when count(*) filter (where event_name = 'replay_started') = 0 then null
        else round(
          (count(distinct event_id) filter (where event_name = 'replay_completed'))::numeric
          / nullif(
              (count(distinct event_id) filter (where event_name = 'replay_started'))::numeric,
              0
            ),
          4
        )
      end
      from public.analytics_outbox
    ) as replay_completion_rate,
    (select count(*)::integer from public.battle_replays) as replay_count,
    (select count(*)::integer from public.accounts) as player_count,
    (select count(*)::integer from public.characters where is_opponent = false) as player_bot_count,
    (select count(*)::integer from public.characters where is_opponent = true) as opponent_bot_count;

revoke all on table public.admin_fight_stats from public;
revoke all on table public.admin_fight_stats from anon;
revoke all on table public.admin_fight_stats from authenticated;
grant select on public.admin_fight_stats to service_role;

comment on view public.admin_fight_stats is
  'Single-row fight/player aggregates for future B2 dashboard (service_role only).';

-- Daily active accounts (fixed 30-day window; dashboard can filter further).
create or replace view public.admin_daily_active_accounts
with (security_invoker = true) as
select
    d.utc_day,
    count(distinct b.initiator_account_id)::integer as accounts
from (
    select generate_series(
        (now() at time zone 'utc')::date - 29,
        (now() at time zone 'utc')::date,
        interval '1 day'
    )::date as utc_day
) d
left join public.battles b on b.utc_day = d.utc_day
group by d.utc_day
order by d.utc_day;

revoke all on table public.admin_daily_active_accounts from public;
revoke all on table public.admin_daily_active_accounts from anon;
revoke all on table public.admin_daily_active_accounts from authenticated;
grant select on public.admin_daily_active_accounts to service_role;

comment on view public.admin_daily_active_accounts is
  'Last 30 UTC days of distinct fight initiators (service_role only).';

-- ---------------------------------------------------------------------------
-- pg_cron recent run history (cron.job_run_details is not client-granted)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_cron_job_runs(p_limit integer default 50)
returns table (
    runid bigint,
    jobid bigint,
    jobname text,
    status text,
    return_message text,
    start_time timestamptz,
    end_time timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, cron
as $$
declare
    v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
    return query
    select
        r.runid,
        r.jobid,
        j.jobname::text,
        r.status::text,
        r.return_message::text,
        r.start_time,
        r.end_time
      from cron.job_run_details r
      join cron.job j on j.jobid = r.jobid
     where j.jobname like 'botore-%'
     order by r.start_time desc nulls last
     limit v_limit;
exception
    when undefined_table then
        -- Local/CI images without job_run_details still expose an empty set.
        return;
    when undefined_column then
        return;
end;
$$;

-- SECURITY DEFINER bypasses RLS; never expose to client JWT roles.
revoke all on function public.admin_list_cron_job_runs(integer) from public;
revoke all on function public.admin_list_cron_job_runs(integer) from anon;
revoke all on function public.admin_list_cron_job_runs(integer) from authenticated;
grant execute on function public.admin_list_cron_job_runs(integer) to service_role;

comment on function public.admin_list_cron_job_runs(integer) is
  'Recent botore pg_cron run rows for ops / future B2 dashboard (service_role / reporting only).';

-- ---------------------------------------------------------------------------
-- Unified dashboard snapshot (one poll for health + ops panes)
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_health jsonb;
    v_outbox jsonb;
    v_fight_stats jsonb;
    v_players jsonb;
    v_bots jsonb;
    v_atlas jsonb;
    v_cron_jobs jsonb;
    v_cron_runs jsonb;
    v_daily jsonb;
    v_recent jsonb;
begin
    select public.backend_health_snapshot() into v_health;
    select public.outbox_status_snapshot() into v_outbox;

    select to_jsonb(s) into v_fight_stats
      from public.admin_fight_stats s
     limit 1;

    select coalesce(jsonb_agg(to_jsonb(p) order by p.account_created_at), '[]'::jsonb)
      into v_players
      from public.admin_players_overview p;

    select coalesce(jsonb_agg(to_jsonb(b) order by b.is_opponent, b.character_id), '[]'::jsonb)
      into v_bots
      from public.admin_bots_overview b;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.version), '[]'::jsonb)
      into v_atlas
      from public.admin_atlas_overview a;

    select coalesce(jsonb_agg(to_jsonb(j) order by j.jobname), '[]'::jsonb)
      into v_cron_jobs
      from public.admin_list_cron_jobs() j;

    select coalesce(jsonb_agg(to_jsonb(r) order by r.start_time desc nulls last), '[]'::jsonb)
      into v_cron_runs
      from public.admin_list_cron_job_runs(20) r;

    select coalesce(jsonb_agg(to_jsonb(d) order by d.utc_day), '[]'::jsonb)
      into v_daily
      from public.admin_daily_active_accounts d;

    select coalesce(jsonb_agg(to_jsonb(rb)), '[]'::jsonb)
      into v_recent
      from (
        select *
          from public.admin_recent_battles
         limit 25
      ) rb;

    return jsonb_build_object(
        'ok', true,
        'service', 'admin-dashboard',
        'health', v_health,
        'outbox', v_outbox,
        'fightStats', coalesce(v_fight_stats, '{}'::jsonb),
        'dailyActiveAccounts', coalesce(v_daily, '[]'::jsonb),
        'players', coalesce(v_players, '[]'::jsonb),
        'bots', coalesce(v_bots, '[]'::jsonb),
        'atlasVersions', coalesce(v_atlas, '[]'::jsonb),
        'cronJobs', coalesce(v_cron_jobs, '[]'::jsonb),
        'cronJobRuns', coalesce(v_cron_runs, '[]'::jsonb),
        'recentBattles', coalesce(v_recent, '[]'::jsonb),
        'checkedAt', now()
    );
end;
$$;

-- SECURITY DEFINER aggregates cross-tenant admin data; never expose to
-- anon/authenticated (they would bypass RLS via the definer owner).
revoke all on function public.admin_dashboard_snapshot() from public;
revoke all on function public.admin_dashboard_snapshot() from anon;
revoke all on function public.admin_dashboard_snapshot() from authenticated;
grant execute on function public.admin_dashboard_snapshot() to service_role;

comment on function public.admin_dashboard_snapshot() is
  'Aggregated read API for future B2 admin dashboard (service_role / reporting credential only).';
