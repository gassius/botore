-- 0011: server-side ownership + slot compatibility validation
--
-- SECURITY DEFINER so authenticated clients can confirm a loadout without
-- direct INSERT grants on bot_loadout_versions / inventory tables. The
-- function enforces ownership for player characters; opponents are system-
-- owned and may only be updated by roles that bypass the auth.uid() check
-- (service role / postgres — used by seeds and Edge Functions).

create or replace function public.owned_part_quantity(
    p_account_id uuid,
    p_part_id text
) returns integer
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(sum(delta), 0)::integer
    from public.inventory_ledger
    where account_id = p_account_id
      and part_id = p_part_id;
$$;

-- Helper: assert catalogue part is active, correct slot, and owned when required.
create or replace function public._assert_part_slot(
    p_part_id text,
    p_expected_slot text,
    p_account_id uuid,
    p_is_opponent boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_part public.parts_catalogue%rowtype;
    v_qty integer;
begin
    select * into v_part
    from public.parts_catalogue
    where part_id = p_part_id;

    if not found then
        raise exception 'unknown_part: %', p_part_id
            using errcode = 'P0002';
    end if;

    if not v_part.is_active then
        raise exception 'inactive_part: %', p_part_id
            using errcode = '22023';
    end if;

    if v_part.slot_kind is distinct from p_expected_slot then
        raise exception 'slot_mismatch: part % is % but expected %',
            p_part_id, v_part.slot_kind, p_expected_slot
            using errcode = '22023';
    end if;

    -- Opponents are system-configured from the catalogue; players must own.
    if not p_is_opponent then
        if p_account_id is null then
            raise exception 'forbidden: player character missing account'
                using errcode = '42501';
        end if;
        v_qty := public.owned_part_quantity(p_account_id, p_part_id);
        if v_qty < 1 then
            raise exception 'unowned_part: account does not own %', p_part_id
                using errcode = '42501';
        end if;
    end if;
end;
$$;

create or replace function public.save_bot_loadout(
    p_character_id text,
    p_loadout jsonb,
    p_atlas_version text default 'v1'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_character public.characters%rowtype;
    v_caller uuid := auth.uid();
    v_chassis text;
    v_paint text;
    v_weapon text;
    v_shield text;
    v_drone text;
    v_decals jsonb;
    v_sound_tags jsonb;
    v_part_id text;
    v_version_id uuid;
    v_required text[] := array['chassis', 'paint', 'weapon'];
    v_key text;
    v_normalized jsonb;
begin
    if p_loadout is null or jsonb_typeof(p_loadout) <> 'object' then
        raise exception 'invalid_loadout: loadout must be a JSON object'
            using errcode = '22023';
    end if;

    if p_atlas_version is null or p_atlas_version !~ '^v[0-9]+$' then
        raise exception 'invalid_atlas_version: expected vN (e.g. v1)'
            using errcode = '22023';
    end if;

    select * into v_character
    from public.characters
    where character_id = p_character_id;

    if not found then
        raise exception 'unknown_character: %', p_character_id
            using errcode = 'P0002';
    end if;

    -- Authenticated clients may only save their own player character.
    -- Service role / migrations (auth.uid() null) may seed any character,
    -- including system opponents.
    if v_caller is not null then
        if v_character.is_opponent
           or v_character.account_id is distinct from v_caller then
            raise exception 'forbidden: loadout save requires character ownership'
                using errcode = '42501';
        end if;
    end if;

    for v_key in select unnest(v_required) loop
        if not (p_loadout ? v_key)
           or jsonb_typeof(p_loadout -> v_key) <> 'string'
           or nullif(p_loadout ->> v_key, '') is null then
            raise exception 'invalid_loadout: missing required slot %', v_key
                using errcode = '22023';
        end if;
    end loop;

    v_chassis := p_loadout ->> 'chassis';
    v_paint := p_loadout ->> 'paint';
    v_weapon := p_loadout ->> 'weapon';

    -- Optional extension slots: null / missing / empty string => unequipped.
    v_shield := nullif(p_loadout ->> 'shield', '');
    v_drone := nullif(p_loadout ->> 'drone', '');

    if p_loadout ? 'decals' then
        if jsonb_typeof(p_loadout -> 'decals') <> 'array' then
            raise exception 'invalid_loadout: decals must be an array'
                using errcode = '22023';
        end if;
        v_decals := p_loadout -> 'decals';
        if jsonb_array_length(v_decals) > 8 then
            raise exception 'invalid_loadout: at most 8 decals'
                using errcode = '22023';
        end if;
    else
        v_decals := '[]'::jsonb;
    end if;

    -- Validate each equipped part exists, is active, and matches its slot.
    perform public._assert_part_slot(v_chassis, 'chassis', v_character.account_id, v_character.is_opponent);
    perform public._assert_part_slot(v_paint, 'paint', v_character.account_id, v_character.is_opponent);
    perform public._assert_part_slot(v_weapon, 'weapon', v_character.account_id, v_character.is_opponent);

    if v_shield is not null then
        perform public._assert_part_slot(v_shield, 'shield', v_character.account_id, v_character.is_opponent);
    end if;
    if v_drone is not null then
        perform public._assert_part_slot(v_drone, 'drone', v_character.account_id, v_character.is_opponent);
    end if;

    for v_part_id in
        select jsonb_array_elements_text(v_decals)
    loop
        perform public._assert_part_slot(v_part_id, 'decal', v_character.account_id, v_character.is_opponent);
    end loop;

    -- Derive sound tags from equipped sounding parts when omitted.
    if p_loadout ? 'soundTags' then
        if jsonb_typeof(p_loadout -> 'soundTags') <> 'array' then
            raise exception 'invalid_loadout: soundTags must be an array'
                using errcode = '22023';
        end if;
        v_sound_tags := p_loadout -> 'soundTags';
    else
        select coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)
        into v_sound_tags
        from (
            select distinct jsonb_array_elements_text(pc.sound_tags) as tag
            from public.parts_catalogue pc
            where pc.part_id in (v_chassis, v_weapon)
               or (v_shield is not null and pc.part_id = v_shield)
               or (v_drone is not null and pc.part_id = v_drone)
        ) t
        where tag is not null and tag <> '';
    end if;

    -- jsonb_build_object drops SQL NULL values; coalesce keeps explicit JSON nulls.
    v_normalized :=
        jsonb_build_object(
            'chassis', v_chassis,
            'paint', v_paint,
            'weapon', v_weapon,
            'decals', v_decals,
            'soundTags', v_sound_tags
        )
        || jsonb_build_object('shield', coalesce(to_jsonb(v_shield), 'null'::jsonb))
        || jsonb_build_object('drone', coalesce(to_jsonb(v_drone), 'null'::jsonb));

    insert into public.bot_loadout_versions (
        character_id,
        loadout,
        atlas_version
    ) values (
        p_character_id,
        v_normalized,
        p_atlas_version
    )
    returning loadout_version_id into v_version_id;

    return v_version_id;
end;
$$;

revoke all on function public._assert_part_slot(text, text, uuid, boolean) from public;
revoke all on function public.save_bot_loadout(text, jsonb, text) from public;
grant execute on function public.save_bot_loadout(text, jsonb, text) to authenticated, service_role;
grant execute on function public.owned_part_quantity(uuid, text) to authenticated, service_role, anon;

comment on function public.save_bot_loadout(text, jsonb, text) is
  'Validates ownership + slot compatibility and appends an immutable loadout version.';
