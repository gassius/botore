-- 0040: prepare_fight_context uses accounts.active_character_id (E4 multi-bot).
--
-- Bug: 0014 resolved the attacker with `WHERE account_id = … LIMIT 1`, so after
-- Ludus select_active_character the client hydrated the selected bot (sprite /
-- sealedBuilds) while combat-v1 still sealed + recorded the first owned bot.
-- Additive replace only — same signature (uuid, text); grants unchanged from 0025.

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
    v_active text;
    -- Caller identity from JWT claims only (never current_user inside SECURITY DEFINER).
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
begin
    -- Explicit role gate: Edge uses service_role after verifying the user JWT.
    -- Authenticated callers may only request their own account_id.
    if v_jwt_role = 'service_role' then
        null;
    elsif v_jwt_role = 'authenticated' then
        if v_caller is null or v_caller is distinct from p_account_id then
            raise exception 'forbidden: prepare_fight_context requires matching auth.uid()'
                using errcode = '42501';
        end if;
    else
        raise exception 'forbidden: prepare_fight_context requires authenticated or service_role'
            using errcode = '42501';
    end if;

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

    -- E4 / BT-272: prefer the Ludus-selected active bot, not an arbitrary LIMIT 1.
    select a.active_character_id into v_active
      from public.accounts a
     where a.id = p_account_id;

    if v_active is not null then
      select c.character_id, c.display_name, c.is_opponent
        into v_attacker_id, v_attacker_name, v_attacker_is_opponent
        from public.characters c
       where c.character_id = v_active
         and c.account_id = p_account_id
         and c.is_opponent = false
         and coalesce(c.owner_is_npc, false) = false;
    end if;

    if v_attacker_id is null then
      -- Legacy / unset active: oldest owned player bot (same order as list_owned).
      select c.character_id, c.display_name, c.is_opponent
        into v_attacker_id, v_attacker_name, v_attacker_is_opponent
        from public.characters c
       where c.account_id = p_account_id
         and c.is_opponent = false
         and coalesce(c.owner_is_npc, false) = false
       order by c.created_at asc nulls last, c.character_id asc
       limit 1;
    end if;

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

comment on function public.prepare_fight_context(uuid, text) is
  'F2 eligibility + immutable fighter snapshots. Attacker = accounts.active_character_id (E4/BT-272), else oldest owned player bot. EXECUTE: authenticated (own account) + service_role (combat-v1). Does not consume allowance (F3).';
