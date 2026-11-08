-- 0014: F2 fight eligibility context for the combat-v1 Edge Function.
--
-- prepare_fight_context validates ownership, opponent eligibility, confirmed
-- loadouts, combat builds, and remaining fight allowance WITHOUT consuming
-- the allowance (F3 owns atomic consume + persist).
-- Admin read views keep B2 dashboard-ready (do not build B2 here).

create or replace function public.prepare_fight_context(
    p_account_id uuid,
    p_opponent_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_attacker_id text;
    v_attacker_name text;
    v_defender_name text;
    v_attacker_is_opponent boolean;
    v_defender_is_opponent boolean;
    v_attacker_build public.current_character_builds%rowtype;
    v_defender_build public.current_character_builds%rowtype;
    v_attacker_loadout public.current_bot_loadouts%rowtype;
    v_defender_loadout public.current_bot_loadouts%rowtype;
    v_attacker_weapon_kind text;
    v_attacker_weapon_power integer;
    v_defender_weapon_kind text;
    v_defender_weapon_power integer;
    v_weapon_part_id text;
    v_owned integer;
    v_allowances_remaining integer;
    v_utc_day date := (now() at time zone 'utc')::date;
begin
    if p_account_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'unauthenticated',
            'message', 'account required'
        );
    end if;

    if p_opponent_id is null or length(trim(p_opponent_id)) = 0 then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_opponent',
            'message', 'opponentId required'
        );
    end if;

    select c.character_id, c.display_name, c.is_opponent
      into v_attacker_id, v_attacker_name, v_attacker_is_opponent
      from public.characters c
     where c.account_id = p_account_id
     limit 1;

    if v_attacker_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'no_character',
            'message', 'account has no player character'
        );
    end if;

    if v_attacker_is_opponent then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_attacker',
            'message', 'attacker must be a player character'
        );
    end if;

    select c.display_name, c.is_opponent
      into v_defender_name, v_defender_is_opponent
      from public.characters c
     where c.character_id = p_opponent_id;

    if not found then
        return jsonb_build_object(
            'ok', false,
            'code', 'unknown_opponent',
            'message', format('unknown opponent: %s', p_opponent_id)
        );
    end if;

    if not v_defender_is_opponent then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_opponent',
            'message', 'opponent must be a system opponent'
        );
    end if;

    if p_opponent_id = v_attacker_id then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_opponent',
            'message', 'cannot fight self'
        );
    end if;

    select * into v_attacker_build
      from public.current_character_builds
     where character_id = v_attacker_id;
    if not found then
        return jsonb_build_object(
            'ok', false,
            'code', 'missing_build',
            'message', 'attacker has no combat build'
        );
    end if;

    select * into v_defender_build
      from public.current_character_builds
     where character_id = p_opponent_id;
    if not found then
        return jsonb_build_object(
            'ok', false,
            'code', 'missing_build',
            'message', 'defender has no combat build'
        );
    end if;

    select * into v_attacker_loadout
      from public.current_bot_loadouts
     where character_id = v_attacker_id;
    if not found then
        return jsonb_build_object(
            'ok', false,
            'code', 'missing_loadout',
            'message', 'attacker has no confirmed loadout'
        );
    end if;

    select * into v_defender_loadout
      from public.current_bot_loadouts
     where character_id = p_opponent_id;
    if not found then
        return jsonb_build_object(
            'ok', false,
            'code', 'missing_loadout',
            'message', 'defender has no confirmed loadout'
        );
    end if;

    v_weapon_part_id := v_attacker_loadout.loadout->>'weapon';
    select pc.weapon_kind, pc.weapon_power
      into v_attacker_weapon_kind, v_attacker_weapon_power
      from public.parts_catalogue pc
     where pc.part_id = v_weapon_part_id
       and pc.slot_kind = 'weapon'
       and pc.is_active;
    if v_attacker_weapon_kind is null or v_attacker_weapon_power is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_weapon',
            'message', 'attacker loadout weapon missing from catalogue'
        );
    end if;

    select public.owned_part_quantity(p_account_id, v_weapon_part_id) into v_owned;
    if coalesce(v_owned, 0) < 1 then
        return jsonb_build_object(
            'ok', false,
            'code', 'unowned_part',
            'message', format('attacker does not own weapon %s', v_weapon_part_id)
        );
    end if;

    v_weapon_part_id := v_defender_loadout.loadout->>'weapon';
    select pc.weapon_kind, pc.weapon_power
      into v_defender_weapon_kind, v_defender_weapon_power
      from public.parts_catalogue pc
     where pc.part_id = v_weapon_part_id
       and pc.slot_kind = 'weapon'
       and pc.is_active;
    if v_defender_weapon_kind is null or v_defender_weapon_power is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_weapon',
            'message', 'defender loadout weapon missing from catalogue'
        );
    end if;

    select count(*)::integer into v_allowances_remaining
      from public.fight_allowances fa
     where fa.account_id = p_account_id
       and fa.utc_day = v_utc_day
       and fa.used_at is null;

    if v_allowances_remaining < 1 then
        return jsonb_build_object(
            'ok', false,
            'code', 'allowance_exhausted',
            'message', 'daily fight allowance exhausted',
            'allowancesRemaining', 0,
            'utcDay', v_utc_day
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'code', 'eligible',
        'utcDay', v_utc_day,
        'allowancesRemaining', v_allowances_remaining,
        'rulesVersion', 'combat-v1',
        'attacker', jsonb_build_object(
            'characterId', v_attacker_id,
            'displayName', v_attacker_name,
            'hp', v_attacker_build.hp,
            'strength', v_attacker_build.strength,
            'agility', v_attacker_build.agility,
            'speed', v_attacker_build.speed,
            'weaponKind', v_attacker_weapon_kind,
            'weaponPower', v_attacker_weapon_power,
            'loadoutVersionId', v_attacker_loadout.loadout_version_id,
            'atlasVersion', v_attacker_loadout.atlas_version
        ),
        'defender', jsonb_build_object(
            'characterId', p_opponent_id,
            'displayName', v_defender_name,
            'hp', v_defender_build.hp,
            'strength', v_defender_build.strength,
            'agility', v_defender_build.agility,
            'speed', v_defender_build.speed,
            'weaponKind', v_defender_weapon_kind,
            'weaponPower', v_defender_weapon_power,
            'loadoutVersionId', v_defender_loadout.loadout_version_id,
            'atlasVersion', v_defender_loadout.atlas_version
        )
    );
end;
$$;

revoke all on function public.prepare_fight_context(uuid, text) from public;
grant execute on function public.prepare_fight_context(uuid, text)
    to service_role, authenticated;

comment on function public.prepare_fight_context(uuid, text) is
  'F2 eligibility + immutable fighter snapshots for combat-v1 Edge Function. Does not consume allowance (F3).';

-- B2-oriented readability: who can fight, with allowance depth.
create or replace view public.admin_fight_readiness
with (security_invoker = true) as
select
    c.character_id,
    c.display_name,
    c.is_opponent,
    c.account_id,
    (cb.character_id is not null) as has_combat_build,
    (cl.character_id is not null) as has_confirmed_loadout,
    cl.loadout_version_id,
    cl.atlas_version,
    coalesce(fa.remaining, 0) as allowances_remaining_today,
    case
        when c.is_opponent then
            case when cb.character_id is not null and cl.character_id is not null
                 then 'ready_as_opponent' else 'incomplete' end
        when cb.character_id is not null
             and cl.character_id is not null
             and coalesce(fa.remaining, 0) > 0
            then 'ready_to_fight'
        when cb.character_id is not null and cl.character_id is not null
            then 'no_allowance'
        else 'incomplete'
    end as readiness
from public.characters c
left join public.current_character_builds cb using (character_id)
left join public.current_bot_loadouts cl using (character_id)
left join lateral (
    select count(*)::integer as remaining
      from public.fight_allowances a
     where a.account_id = c.account_id
       and a.utc_day = (now() at time zone 'utc')::date
       and a.used_at is null
) fa on true
order by c.is_opponent, c.character_id;

grant select on public.admin_fight_readiness to authenticated, anon;

comment on view public.admin_fight_readiness is
  'Admin/ops view of fight eligibility for future B2 dashboard (not a UI).';

-- Extend health snapshot with fight readiness (backward-compatible keys).
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
    v_ready_fighters integer;
    v_ready_opponents integer;
begin
    select count(*) into v_catalogue_parts from public.parts_catalogue where is_active;
    select count(*) into v_chassis from public.parts_catalogue where slot_kind = 'chassis' and is_active;
    select count(*) into v_paints from public.parts_catalogue where slot_kind = 'paint' and is_active;
    select count(*) into v_weapons from public.parts_catalogue where slot_kind = 'weapon' and is_active;
    select count(*) into v_loadouts from public.current_bot_loadouts;
    select count(*) into v_outbox_pending
      from public.analytics_outbox where processed_at is null;

    -- Count readiness inline (do not query security_invoker admin views from
    -- this security definer function — invoker may be anon).
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
            when v_chassis >= 1 and v_paints >= 2 and v_weapons >= 3
                 and v_loadouts >= 1 and v_ready_opponents >= 1
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
                'persistence', 'pending_f3'
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
