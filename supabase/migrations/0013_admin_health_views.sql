-- 0013: admin-readable reporting views + backend health snapshot
--
-- Designed so a future admin dashboard (B2) can SELECT these without
-- inventing ad-hoc queries. Views use security_invoker; the dashboard
-- connects with a read-only reporting credential that bypasses RLS via
-- a dedicated role OR reads through the service path — not built here.

create view public.admin_catalogue_summary
with (security_invoker = true) as
select
    slot_kind,
    count(*)::integer as part_count,
    count(*) filter (where is_active)::integer as active_count
from public.parts_catalogue
group by slot_kind
order by slot_kind;

create view public.admin_inventory_overview
with (security_invoker = true) as
select
    ib.account_id,
    p.display_name as account_display_name,
    ib.part_id,
    pc.slot_kind,
    pc.display_name as part_display_name,
    ib.quantity
from public.inventory_balances ib
join public.parts_catalogue pc using (part_id)
left join public.profiles p on p.account_id = ib.account_id
order by ib.account_id, pc.slot_kind, ib.part_id;

create view public.admin_loadout_overview
with (security_invoker = true) as
select
    c.character_id,
    c.display_name,
    c.is_opponent,
    c.account_id,
    cl.loadout_version_id,
    cl.atlas_version,
    cl.loadout,
    cl.created_at as loadout_confirmed_at
from public.characters c
left join public.current_bot_loadouts cl using (character_id)
order by c.is_opponent, c.character_id;

-- Health helper used by the Edge Function and smoke tests.
-- Reports schema presence, outbox depth, and catalogue seed shape.
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
    v_pg_cron_present boolean := false;
    v_storage_atlas boolean := false;
begin
    select count(*) into v_catalogue_parts from public.parts_catalogue where is_active;
    select count(*) into v_chassis from public.parts_catalogue where slot_kind = 'chassis' and is_active;
    select count(*) into v_paints from public.parts_catalogue where slot_kind = 'paint' and is_active;
    select count(*) into v_weapons from public.parts_catalogue where slot_kind = 'weapon' and is_active;
    select count(*) into v_loadouts from public.current_bot_loadouts;
    select count(*) into v_outbox_pending
      from public.analytics_outbox where processed_at is null;

    begin
        select exists(
            select 1 from pg_extension where extname = 'pg_cron'
        ) into v_pg_cron_present;
    exception when others then
        v_pg_cron_present := false;
    end;

    begin
        select exists(
            select 1 from storage.buckets where id = 'atlas'
        ) into v_storage_atlas;
    exception when others then
        v_storage_atlas := false;
    end;

    return jsonb_build_object(
        'status', case
            when v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3 and v_loadouts >= 1
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
            'analytics_outbox', jsonb_build_object(
                'pending', v_outbox_pending
            ),
            'pg_cron', jsonb_build_object(
                'present', v_pg_cron_present,
                'note', case when v_pg_cron_present
                    then 'extension installed'
                    else 'not configured yet (expected until F4)' end
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

grant select on public.admin_catalogue_summary to authenticated, anon;
grant select on public.admin_inventory_overview to authenticated, anon;
grant select on public.admin_loadout_overview to authenticated, anon;

comment on function public.backend_health_snapshot() is
  'Backend health snapshot for Edge Function / smoke / future admin dashboard (B2).';
