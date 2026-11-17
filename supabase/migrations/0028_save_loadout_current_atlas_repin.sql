-- 0028: E1 — Customise Save Loadout re-pin current atlas (even if draft)
--
-- ClickUp: E1 Customise Save Loadout does nothing (1amjtrezaj3)
--
-- Root cause: B5 ensure_player_character inserts a starter loadout with
-- atlas_version = 'v1' without requiring atlas_versions publish (Storage may
-- still be draft on hosted Development). Authenticated save_bot_loadout from
-- 0017 still required status = 'published', so Customise Save failed after a
-- successful hydrate.
--
-- Fix: authenticated callers may re-pin the character's *current* atlas pack
-- when changing paint/weapon (and other slots), even if that pack is still
-- draft. Pinning a *different* unpublished atlas version still fails.
-- service_role behaviour unchanged.

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
    v_jwt_role text := coalesce(auth.role(), '');
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
    v_tag_elem jsonb;
    v_atlas_status text;
    v_current_atlas text;
begin
    if p_loadout is null or jsonb_typeof(p_loadout) <> 'object' then
        raise exception 'invalid_loadout: loadout must be a JSON object'
            using errcode = '22023';
    end if;

    if p_atlas_version is null or p_atlas_version !~ '^v[0-9]+$' then
        raise exception 'invalid_atlas_version: expected vN (e.g. v1)'
            using errcode = '22023';
    end if;

    select status into v_atlas_status
      from public.atlas_versions
     where version = p_atlas_version;
    if not found then
        raise exception 'unknown_atlas_version: %', p_atlas_version
            using errcode = 'P0002';
    end if;

    select * into v_character
    from public.characters
    where character_id = p_character_id;

    if not found then
        raise exception 'unknown_character: %', p_character_id
            using errcode = 'P0002';
    end if;

    select cl.atlas_version
      into v_current_atlas
      from public.current_bot_loadouts cl
     where cl.character_id = p_character_id;

    -- Explicit role gate: never treat "no JWT" as a privileged bypass.
    -- Contract (F5/F6): authenticated clients may pin a published pack, or
    -- re-pin the character's already-confirmed atlas (E1 / B5 first-run).
    -- service_role may pin draft during seed (before Storage bootstrap publishes).
    if v_jwt_role = 'service_role' then
        null; -- system path: seeds / Edge Functions may confirm any character
    elsif v_jwt_role = 'authenticated' then
        if v_atlas_status is distinct from 'published'
           and (v_current_atlas is null
                or v_current_atlas is distinct from p_atlas_version) then
            raise exception 'unpublished_atlas_version: %', p_atlas_version
                using errcode = '22023';
        end if;
        if v_caller is null
           or v_character.is_opponent
           or v_character.account_id is distinct from v_caller then
            raise exception 'forbidden: loadout save requires character ownership'
                using errcode = '42501';
        end if;
    else
        raise exception 'forbidden: save_bot_loadout requires authenticated or service_role'
            using errcode = '42501';
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
        for v_tag_elem in select value from jsonb_array_elements(p_loadout -> 'soundTags')
        loop
            if jsonb_typeof(v_tag_elem) <> 'string' then
                raise exception 'invalid_loadout: soundTags elements must be strings'
                    using errcode = '22023';
            end if;
        end loop;
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

revoke all on function public.save_bot_loadout(text, jsonb, text) from public;
revoke all on function public.save_bot_loadout(text, jsonb, text) from anon;
grant execute on function public.save_bot_loadout(text, jsonb, text) to authenticated, service_role;

comment on function public.save_bot_loadout(text, jsonb, text) is
  'Validates ownership + slot compatibility; authenticated may pin published atlas or re-pin current draft atlas (E1); appends immutable loadout version.';
