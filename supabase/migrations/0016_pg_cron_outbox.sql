-- 0016: F4 — outbox drain + scheduled allowance refresh via pg_cron.
--
-- No Fastify/worker/queue. Processing is idempotent and retry-safe; failed
-- rows stay visible (attempt_count / last_error / dead_lettered_at) until
-- success or explicit retry. Admin views/RPCs prepare a future B2 dashboard.

-- ---------------------------------------------------------------------------
-- Extension + outbox failure columns
-- ---------------------------------------------------------------------------
-- Prefer existing install. On Supabase images `postgres` is often not
-- superuser; migrations still succeed when supabase_admin preinstalled it
-- or when the applying role can create the extension.
do $$
begin
  create extension if not exists pg_cron;
exception
  when insufficient_privilege then
    if not exists (select 1 from pg_extension where extname = 'pg_cron') then
      raise exception 'pg_cron extension required for F4 (grant create or preinstall)';
    end if;
  when duplicate_object then
    null;
end $$;

alter table public.analytics_outbox
    add column if not exists attempt_count integer not null default 0
        check (attempt_count >= 0),
    add column if not exists last_error text,
    add column if not exists last_attempted_at timestamptz,
    add column if not exists dead_lettered_at timestamptz;

comment on column public.analytics_outbox.attempt_count is
  'Delivery attempts by process_analytics_outbox (F4).';
comment on column public.analytics_outbox.last_error is
  'Most recent delivery/validation failure; null after success.';
comment on column public.analytics_outbox.dead_lettered_at is
  'Set when max attempts exceeded; row stays unprocessed and visible.';

create index if not exists analytics_outbox_failed_idx
    on public.analytics_outbox (created_at)
    where processed_at is null and last_error is not null;

create index if not exists analytics_outbox_dead_letter_idx
    on public.analytics_outbox (dead_lettered_at)
    where dead_lettered_at is not null;

-- ---------------------------------------------------------------------------
-- Internal: validate one outbox row shape (catalog v1, server-side events)
-- ---------------------------------------------------------------------------
create or replace function public._outbox_validate_row(
    p_event_name text,
    p_schema_version integer,
    p_context jsonb,
    p_payload jsonb
) returns text
language plpgsql
immutable
as $$
begin
    if p_event_name is null or length(trim(p_event_name)) = 0 then
        return 'event_name missing';
    end if;
    if p_schema_version is distinct from 1 then
        return format('unsupported schema_version: %s', p_schema_version);
    end if;
    if p_context is null or jsonb_typeof(p_context) <> 'object' then
        return 'context must be object';
    end if;
    if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
        return 'payload must be object';
    end if;

    -- Known F3 emit: battle_completed. Other catalog names accepted with
    -- light shape checks so future producers can enqueue without a migration.
    if p_event_name = 'battle_completed' then
        if coalesce(p_payload->>'battleId', '') = '' then
            return 'battle_completed.payload.battleId missing';
        end if;
        if p_payload->>'won' is null then
            return 'battle_completed.payload.won missing';
        end if;
        if p_payload->>'xpAwarded' is null then
            return 'battle_completed.payload.xpAwarded missing';
        end if;
        return null;
    end if;

    if p_event_name in (
        'account_created',
        'character_created',
        'opponent_list_viewed',
        'opponent_selected',
        'battle_requested',
        'replay_started',
        'replay_completed',
        'xp_awarded'
    ) then
        return null;
    end if;

    return format('unknown event_name: %s', p_event_name);
end;
$$;

revoke all on function public._outbox_validate_row(text, integer, jsonb, jsonb) from public;
revoke all on function public._outbox_validate_row(text, integer, jsonb, jsonb) from anon;
revoke all on function public._outbox_validate_row(text, integer, jsonb, jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- Drain: claim → validate (noop sink) → mark processed or record failure
-- ---------------------------------------------------------------------------
create or replace function public.process_analytics_outbox(
    p_batch_size integer default 50,
    p_max_attempts integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text := coalesce(auth.role(), '');
    v_claimed integer := 0;
    v_delivered integer := 0;
    v_failed integer := 0;
    v_dead_lettered integer := 0;
    v_row record;
    v_err text;
    v_attempts integer;
begin
    -- pg_cron runs as the DB owner; direct RPC callers must be service_role.
    if v_role is distinct from 'service_role'
       and current_user not in ('postgres', 'supabase_admin') then
        raise exception 'process_analytics_outbox requires service_role'
            using errcode = '42501';
    end if;

    if p_batch_size is null or p_batch_size < 1 or p_batch_size > 500 then
        raise exception 'p_batch_size must be between 1 and 500';
    end if;
    if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then
        raise exception 'p_max_attempts must be between 1 and 100';
    end if;

    for v_row in
        select o.event_id, o.event_name, o.schema_version, o.context, o.payload,
               o.attempt_count
          from public.analytics_outbox o
         where o.processed_at is null
           and o.dead_lettered_at is null
         order by o.created_at
         for update skip locked
         limit p_batch_size
    loop
        v_claimed := v_claimed + 1;
        v_err := public._outbox_validate_row(
            v_row.event_name, v_row.schema_version, v_row.context, v_row.payload
        );

        if v_err is null then
            -- Noop sink: validated rows are considered delivered. External
            -- adapters (PostHog) can replace this path later without changing
            -- claim/idempotency semantics — event_id remains the dedupe key.
            update public.analytics_outbox
               set processed_at = now(),
                   last_error = null,
                   last_attempted_at = now(),
                   attempt_count = v_row.attempt_count + 1
             where event_id = v_row.event_id
               and processed_at is null;

            if found then
                v_delivered := v_delivered + 1;
                insert into public.admin_audit_log (actor, action, details)
                values (
                    'pg_cron',
                    'outbox_delivered',
                    jsonb_build_object(
                        'eventId', v_row.event_id,
                        'eventName', v_row.event_name,
                        'sink', 'noop'
                    )
                );
            end if;
        else
            v_attempts := v_row.attempt_count + 1;
            if v_attempts >= p_max_attempts then
                update public.analytics_outbox
                   set attempt_count = v_attempts,
                       last_error = v_err,
                       last_attempted_at = now(),
                       dead_lettered_at = now()
                 where event_id = v_row.event_id
                   and processed_at is null
                   and dead_lettered_at is null;
                v_dead_lettered := v_dead_lettered + 1;
            else
                update public.analytics_outbox
                   set attempt_count = v_attempts,
                       last_error = v_err,
                       last_attempted_at = now()
                 where event_id = v_row.event_id
                   and processed_at is null
                   and dead_lettered_at is null;
            end if;
            v_failed := v_failed + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'ok', true,
        'claimed', v_claimed,
        'delivered', v_delivered,
        'failed', v_failed,
        'deadLettered', v_dead_lettered,
        'batchSize', p_batch_size,
        'maxAttempts', p_max_attempts
    );
end;
$$;

comment on function public.process_analytics_outbox(integer, integer) is
  'F4: claim pending analytics_outbox rows (SKIP LOCKED), validate, mark processed or record visible failure. Idempotent / retry-safe.';

revoke all on function public.process_analytics_outbox(integer, integer) from public;
revoke all on function public.process_analytics_outbox(integer, integer) from anon;
revoke all on function public.process_analytics_outbox(integer, integer) from authenticated;
grant execute on function public.process_analytics_outbox(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Manual retry for dead-lettered / failed rows (admin / ops API)
-- ---------------------------------------------------------------------------
create or replace function public.retry_outbox_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text := coalesce(auth.role(), '');
    v_updated integer;
begin
    if v_role is distinct from 'service_role'
       and current_user not in ('postgres', 'supabase_admin') then
        raise exception 'retry_outbox_event requires service_role'
            using errcode = '42501';
    end if;

    update public.analytics_outbox
       set dead_lettered_at = null,
           last_error = null,
           -- keep attempt_count history; next drain increments again
           last_attempted_at = null
     where event_id = p_event_id
       and processed_at is null;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        return jsonb_build_object(
            'ok', false,
            'reason', 'not_found_or_already_processed',
            'eventId', p_event_id
        );
    end if;

    insert into public.admin_audit_log (actor, action, details)
    values (
        coalesce(nullif(v_role, ''), current_user),
        'outbox_retry_requested',
        jsonb_build_object('eventId', p_event_id)
    );

    return jsonb_build_object('ok', true, 'eventId', p_event_id, 'requeued', true);
end;
$$;

revoke all on function public.retry_outbox_event(uuid) from public;
revoke all on function public.retry_outbox_event(uuid) from anon;
revoke all on function public.retry_outbox_event(uuid) from authenticated;
grant execute on function public.retry_outbox_event(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Scheduled: ensure fight allowance slots for today..today+horizon
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
begin
    if v_role is distinct from 'service_role'
       and current_user not in ('postgres', 'supabase_admin') then
        raise exception 'ensure_fight_allowances requires service_role'
            using errcode = '42501';
    end if;

    if p_horizon_days is null or p_horizon_days < 0 or p_horizon_days > 14 then
        raise exception 'p_horizon_days must be between 0 and 14';
    end if;

    with candidates as (
        select a.id as account_id, d::date as utc_day, s.slot_index
          from public.accounts a
          cross join generate_series(
              v_today,
              v_today + p_horizon_days,
              interval '1 day'
          ) as d
          cross join (values (1), (2), (3)) as s(slot_index)
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
        'toDay', v_today + p_horizon_days
    );
end;
$$;

comment on function public.ensure_fight_allowances(integer) is
  'F4: idempotent create of 3 fight allowance slots per account for today..today+horizon (UTC).';

revoke all on function public.ensure_fight_allowances(integer) from public;
revoke all on function public.ensure_fight_allowances(integer) from anon;
revoke all on function public.ensure_fight_allowances(integer) from authenticated;
grant execute on function public.ensure_fight_allowances(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Admin / ops read APIs (B2 later — not a UI)
-- ---------------------------------------------------------------------------
create or replace view public.admin_outbox_overview
with (security_invoker = true) as
select
    count(*)::integer as total,
    count(*) filter (where processed_at is not null)::integer as processed,
    count(*) filter (
        where processed_at is null and dead_lettered_at is null
    )::integer as pending,
    count(*) filter (
        where processed_at is null
          and dead_lettered_at is null
          and last_error is not null
    )::integer as failing,
    count(*) filter (where dead_lettered_at is not null)::integer as dead_lettered,
    max(created_at) filter (where processed_at is null) as oldest_pending_at,
    max(last_attempted_at) as last_attempted_at
from public.analytics_outbox;

grant select on public.admin_outbox_overview to authenticated, anon;

comment on view public.admin_outbox_overview is
  'Admin/ops outbox depth for future B2 dashboard (not a UI).';

create or replace view public.admin_outbox_failures
with (security_invoker = true) as
select
    event_id,
    event_name,
    schema_version,
    context,
    payload,
    attempt_count,
    last_error,
    last_attempted_at,
    dead_lettered_at,
    created_at,
    case
        when dead_lettered_at is not null then 'dead_lettered'
        when last_error is not null then 'failing'
        else 'pending'
    end as failure_state
from public.analytics_outbox
where processed_at is null
  and (last_error is not null or dead_lettered_at is not null)
order by coalesce(dead_lettered_at, last_attempted_at, created_at) desc;

grant select on public.admin_outbox_failures to authenticated, anon;

comment on view public.admin_outbox_failures is
  'Visible failed / dead-lettered outbox rows for ops (F4).';

-- cron.job is not granted to clients; expose via SECURITY DEFINER RPC.
create or replace function public.admin_list_cron_jobs()
returns table (
    jobid bigint,
    jobname text,
    schedule text,
    command text,
    active boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, cron
as $$
begin
    return query
    select j.jobid, j.jobname::text, j.schedule::text, j.command::text, j.active
      from cron.job j
     where j.jobname like 'botore-%'
     order by j.jobname;
end;
$$;

revoke all on function public.admin_list_cron_jobs() from public;
grant execute on function public.admin_list_cron_jobs() to authenticated, anon, service_role;

comment on function public.admin_list_cron_jobs() is
  'Scheduled botore pg_cron jobs for ops / future B2 dashboard.';

create or replace function public.outbox_status_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_overview jsonb;
    v_jobs jsonb;
begin
    -- Query tables directly (SECURITY DEFINER bypasses RLS); do not rely on
    -- security_invoker admin views which would re-check the session role.
    select jsonb_build_object(
        'total', count(*)::integer,
        'processed', count(*) filter (where processed_at is not null)::integer,
        'pending', count(*) filter (
            where processed_at is null and dead_lettered_at is null
        )::integer,
        'failing', count(*) filter (
            where processed_at is null
              and dead_lettered_at is null
              and last_error is not null
        )::integer,
        'dead_lettered', count(*) filter (
            where dead_lettered_at is not null
        )::integer,
        'oldest_pending_at', max(created_at) filter (where processed_at is null),
        'last_attempted_at', max(last_attempted_at)
    ) into v_overview
    from public.analytics_outbox;

    select coalesce(jsonb_agg(to_jsonb(j) order by j.jobname), '[]'::jsonb)
      into v_jobs
      from public.admin_list_cron_jobs() j;

    return jsonb_build_object(
        'ok', true,
        'outbox', v_overview,
        'cronJobs', v_jobs,
        'checkedAt', now()
    );
end;
$$;

revoke all on function public.outbox_status_snapshot() from public;
grant execute on function public.outbox_status_snapshot() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Schedule jobs (idempotent by job name)
-- ---------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select jobid from cron.job
         where jobname in ('botore-outbox-drain', 'botore-allowance-refresh')
    loop
        perform cron.unschedule(r.jobid);
    end loop;

    -- Every minute: drain a batch of outbox rows.
    perform cron.schedule(
        'botore-outbox-drain',
        '* * * * *',
        $cron$select public.process_analytics_outbox(50, 5)$cron$
    );

    -- Daily 00:05 UTC: ensure today + tomorrow allowance slots exist.
    perform cron.schedule(
        'botore-allowance-refresh',
        '5 0 * * *',
        $cron$select public.ensure_fight_allowances(1)$cron$
    );
end $$;

-- ---------------------------------------------------------------------------
-- Health: pg_cron jobs registered + outbox failure depth
-- ---------------------------------------------------------------------------
create or replace function public.backend_health_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_db_ok boolean := true;
    v_catalogue_parts integer;
    v_chassis integer;
    v_paints integer;
    v_weapons integer;
    v_loadouts integer;
    v_outbox_pending integer;
    v_outbox_failing integer;
    v_outbox_dead integer;
    v_pg_cron_present boolean := false;
    v_cron_jobs integer := 0;
    v_outbox_job boolean := false;
    v_allowance_job boolean := false;
    v_storage_atlas boolean := false;
    v_ready_fighters integer;
    v_ready_opponents integer;
    v_persist_present boolean := false;
    v_process_present boolean := false;
    v_battles_today integer;
begin
    select count(*) into v_catalogue_parts from public.parts_catalogue where is_active;
    select count(*) into v_chassis from public.parts_catalogue where slot_kind = 'chassis' and is_active;
    select count(*) into v_paints from public.parts_catalogue where slot_kind = 'paint' and is_active;
    select count(*) into v_weapons from public.parts_catalogue where slot_kind = 'weapon' and is_active;
    select count(*) into v_loadouts from public.current_bot_loadouts;
    select count(*) into v_outbox_pending
      from public.analytics_outbox
     where processed_at is null and dead_lettered_at is null;
    select count(*) into v_outbox_failing
      from public.analytics_outbox
     where processed_at is null
       and dead_lettered_at is null
       and last_error is not null;
    select count(*) into v_outbox_dead
      from public.analytics_outbox
     where dead_lettered_at is not null;

    select count(*) into v_ready_fighters
      from public.characters c
      join public.current_character_builds cb using (character_id)
      join public.current_bot_loadouts cl using (character_id)
     where c.is_opponent = false
       and exists (
         select 1 from public.fight_allowances a
          where a.account_id = c.account_id
            and a.utc_day = (now() at time zone 'utc')::date
            and a.used_at is null
       );
    select count(*) into v_ready_opponents
      from public.characters c
      join public.current_character_builds cb using (character_id)
      join public.current_bot_loadouts cl using (character_id)
     where c.is_opponent = true;

    select exists(
        select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'persist_fight_result'
    ) into v_persist_present;

    select exists(
        select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'process_analytics_outbox'
    ) into v_process_present;

    select count(*) into v_battles_today
      from public.battles
     where utc_day = (now() at time zone 'utc')::date;

    begin
        select exists(
            select 1 from pg_extension where extname = 'pg_cron'
        ) into v_pg_cron_present;
    exception when others then
        v_pg_cron_present := false;
    end;

    if v_pg_cron_present then
        begin
            select count(*)::integer into v_cron_jobs
              from cron.job
             where jobname like 'botore-%' and active;
            select exists(
                select 1 from cron.job
                 where jobname = 'botore-outbox-drain' and active
            ) into v_outbox_job;
            select exists(
                select 1 from cron.job
                 where jobname = 'botore-allowance-refresh' and active
            ) into v_allowance_job;
        exception when others then
            v_cron_jobs := 0;
            v_outbox_job := false;
            v_allowance_job := false;
        end;
    end if;

    begin
        select exists(
            select 1 from storage.buckets where id = 'atlas'
        ) into v_storage_atlas;
    exception when others then
        v_storage_atlas := false;
    end;

    return jsonb_build_object(
        'status', case
            when v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3
                 and v_loadouts >= 1 and v_ready_opponents >= 1
                 and v_persist_present and v_process_present
                 and v_pg_cron_present and v_outbox_job and v_allowance_job
            then 'ok' else 'degraded' end,
        'checks', jsonb_build_object(
            'database', v_db_ok,
            'parts_catalogue', jsonb_build_object(
                'total_active', v_catalogue_parts,
                'chassis', v_chassis,
                'paints', v_paints,
                'weapons', v_weapons,
                'proof_seed_ok', (v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3)
            ),
            'bot_loadouts', jsonb_build_object(
                'current_count', v_loadouts
            ),
            'fight', jsonb_build_object(
                'ready_to_fight', v_ready_fighters,
                'ready_as_opponent', v_ready_opponents,
                'edge_function', 'combat-v1',
                'persistence', case when v_persist_present
                    then 'persist_fight_result' else 'pending_f3' end,
                'battles_today', v_battles_today
            ),
            'analytics_outbox', jsonb_build_object(
                'pending', v_outbox_pending,
                'failing', v_outbox_failing,
                'dead_lettered', v_outbox_dead,
                'processor', case when v_process_present
                    then 'process_analytics_outbox' else 'pending_f4' end
            ),
            'pg_cron', jsonb_build_object(
                'present', v_pg_cron_present,
                'active_botore_jobs', v_cron_jobs,
                'outbox_drain_scheduled', v_outbox_job,
                'allowance_refresh_scheduled', v_allowance_job,
                'note', case
                    when v_pg_cron_present and v_outbox_job and v_allowance_job
                    then 'botore-outbox-drain + botore-allowance-refresh scheduled'
                    when v_pg_cron_present
                    then 'extension installed; botore jobs incomplete'
                    else 'pg_cron extension missing'
                end
            ),
            'storage', jsonb_build_object(
                'atlas_bucket', v_storage_atlas
            )
        ),
        'checked_at', now()
    );
end;
$$;

revoke all on function public.backend_health_snapshot() from public;
grant execute on function public.backend_health_snapshot() to authenticated, anon, service_role;
