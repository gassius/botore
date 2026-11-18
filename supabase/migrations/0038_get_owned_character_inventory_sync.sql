-- 0038: Loadout Equip Fix — sync A6 inventory on hydrate + save
--
-- ClickUp / ticket: BT-243 (Carlos APK equip fails weapons/paints/after rename)
-- Agent: Loadout Equip Fix
-- Carlos yes required before apply / merge (Supabase Infra owns migrations).
--
-- Root cause:
--   get_owned_character (0027) only called ensure_player_character when no
--   character existed. Returning players never re-ran A6 catalogue inventory
--   grants on hydrate. Migration 0035 one-shot backfill is not a durable sync
--   path (and may be missing on hosted Dev). Equip of paint-hazard /
--   weapon-mace / etc. then fails in save_bot_loadout with unowned_part.
--   Rename + Equip shares the same save path when new parts are selected.
--
-- Fix:
--   1) ensure_player_character grants when owned quantity < 1 (not merely
--      when no historical positive grant row exists — revoke-safe).
--      Quantity is computed with an inline SUM (VOLATILE plpgsql statement),
--      not via STABLE owned_part_quantity inside a mutating INSERT/SELECT.
--   2) get_owned_character always invokes ensure so starter/A6 grants sync
--      for existing characters on hydrate.
--   3) save_bot_loadout (authenticated owner path) calls ensure before
--      ownership asserts so Equip self-heals without requiring a remount.
--   4) current_bot_loadouts ties on created_at break by loadout_version_id
--      (same-tx now() collisions no longer hide the newest Equip).
--   5) Idempotent A6 inventory backfill (safe re-run; ledger SUM subquery).
--
-- Prefix: E4 owns 0037; this PR owns 0038. Fight-end / name-input: 0039+.

-- ---------------------------------------------------------------------------
-- ensure_player_character: quantity-based A6 grants (mirrors 0035 + 0038 fix)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_player_character(
    p_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text := coalesce(auth.role(), '');
    v_caller uuid := auth.uid();
    v_deleted_at timestamptz;
    v_character_id text;
    v_display_name text;
    v_botore_id text;
    v_created boolean := false;
    v_loadout_created boolean := false;
    v_loadout_version_id uuid;
    v_build_count integer;
    v_part_id text;
    v_qty integer;
    v_today date := (now() at time zone 'utc')::date;
    v_normalized jsonb;
    v_sound_tags jsonb;
begin
    if v_role = 'service_role' then
        null;
    elsif v_role = 'authenticated'
          and v_caller is not null
          and v_caller = p_account_id then
        null;
    else
        raise exception 'forbidden: ensure_player_character requires service_role or owning authenticated'
            using errcode = '42501';
    end if;

    if p_account_id is null then
        raise exception 'invalid_account: p_account_id is required'
            using errcode = '22023';
    end if;

    begin
        insert into public.accounts (id) values (p_account_id)
        on conflict (id) do nothing;
    exception
        when foreign_key_violation then
            return jsonb_build_object(
                'ok', false,
                'code', 'unknown_account',
                'message', 'auth.users row missing for account id'
            );
    end;

    select a.deleted_at
      into v_deleted_at
      from public.accounts a
     where a.id = p_account_id;

    if not found then
        return jsonb_build_object(
            'ok', false,
            'code', 'unknown_account',
            'message', 'account row missing'
        );
    end if;

    if v_deleted_at is not null then
        return jsonb_build_object(
            'ok', false,
            'code', 'account_deleted',
            'message', 'deleted accounts cannot receive a player character'
        );
    end if;

    if not exists (
        select 1 from public.parts_catalogue
         where part_id = 'chassis-basic' and is_active
    ) or not exists (
        select 1 from public.parts_catalogue
         where part_id = 'paint-crimson' and is_active
    ) or not exists (
        select 1 from public.parts_catalogue
         where part_id = 'weapon-sword' and is_active
    ) then
        return jsonb_build_object(
            'ok', false,
            'code', 'catalogue_incomplete',
            'message', 'starter catalogue parts missing (chassis-basic / paint-crimson / weapon-sword)'
        );
    end if;

    select c.character_id, c.display_name
      into v_character_id, v_display_name
      from public.characters c
     where c.account_id = p_account_id
       and c.is_opponent = false
     order by c.character_id asc
     limit 1;

    if v_character_id is null then
        v_character_id := 'player-' || replace(p_account_id::text, '-', '');
        v_display_name := 'Pilot';
        v_botore_id := 'garage-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

        insert into public.profiles (account_id, display_name, botore_id, emblem_id)
        values (p_account_id, v_display_name, v_botore_id, 'emblem-default')
        on conflict (account_id) do update
          set botore_id = coalesce(public.profiles.botore_id, excluded.botore_id),
              emblem_id = coalesce(nullif(public.profiles.emblem_id, ''), excluded.emblem_id);

        begin
            insert into public.characters (
                character_id, account_id, display_name, is_opponent, owner_is_npc
            ) values (
                v_character_id, p_account_id, v_display_name, false, false
            );
            v_created := true;
        exception
            when unique_violation then
                select c.character_id, c.display_name
                  into v_character_id, v_display_name
                  from public.characters c
                 where c.account_id = p_account_id
                   and c.is_opponent = false
                 order by c.character_id asc
                 limit 1;
                v_created := false;
        end;
    else
        update public.profiles
           set botore_id = coalesce(
                 botore_id,
                 'garage-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
               ),
               emblem_id = coalesce(nullif(emblem_id, ''), 'emblem-default')
         where account_id = p_account_id;
    end if;

    select count(*)::integer
      into v_build_count
      from public.character_build_versions
     where character_id = v_character_id;

    if v_build_count = 0 then
        insert into public.character_build_versions (
            character_id, hp, strength, agility, speed, weapon_kind, weapon_power
        ) values (
            v_character_id, 30, 5, 5, 6, 'sword', 3
        );
    end if;

    foreach v_part_id in array array[
        'chassis-basic',
        'paint-crimson',
        'paint-cobalt',
        'paint-primer',
        'paint-ink',
        'paint-drab',
        'paint-navy',
        'paint-frost',
        'paint-cinder',
        'paint-hazard',
        'paint-racing',
        'weapon-sword',
        'weapon-axe',
        'weapon-dagger',
        'weapon-mace',
        'weapon-hammer',
        'weapon-spear',
        'weapon-shield'
    ]
    loop
        -- 0038: grant when current balance < 1 (revoke-safe).
        -- Inline SUM in this VOLATILE plpgsql statement — do not call STABLE
        -- owned_part_quantity from a mutating INSERT/SELECT path.
        if exists (
            select 1 from public.parts_catalogue pc
             where pc.part_id = v_part_id and pc.is_active
        ) then
            select coalesce(sum(il.delta), 0)::integer
              into v_qty
              from public.inventory_ledger il
             where il.account_id = p_account_id
               and il.part_id = v_part_id;
            if v_qty < 1 then
                insert into public.inventory_ledger (account_id, part_id, delta, reason)
                values (p_account_id, v_part_id, 1, 'grant');
            end if;
        end if;
    end loop;

    select cl.loadout_version_id
      into v_loadout_version_id
      from public.current_bot_loadouts cl
     where cl.character_id = v_character_id;

    if v_loadout_version_id is null then
        select coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)
          into v_sound_tags
          from (
            select distinct jsonb_array_elements_text(pc.sound_tags) as tag
              from public.parts_catalogue pc
             where pc.part_id in ('chassis-basic', 'weapon-sword')
          ) t
         where tag is not null and tag <> '';

        v_normalized :=
            jsonb_build_object(
                'chassis', 'chassis-basic',
                'paint', 'paint-crimson',
                'weapon', 'weapon-sword',
                'decals', '[]'::jsonb,
                'soundTags', coalesce(v_sound_tags, '[]'::jsonb)
            )
            || jsonb_build_object('shield', 'null'::jsonb)
            || jsonb_build_object('drone', 'null'::jsonb);

        insert into public.bot_loadout_versions (
            character_id, loadout, atlas_version
        ) values (
            v_character_id, v_normalized, 'v1'
        )
        returning loadout_version_id into v_loadout_version_id;

        v_loadout_created := true;
    end if;

    insert into public.fight_allowances (account_id, utc_day, slot_index)
    select p_account_id, d::date, s.slot_index
      from generate_series(v_today, v_today + 1, interval '1 day') as d
      cross join (values (1), (2), (3)) as s(slot_index)
    on conflict (account_id, utc_day, slot_index) do nothing;

    return jsonb_build_object(
        'ok', true,
        'created', v_created,
        'characterId', v_character_id,
        'displayName', v_display_name,
        'loadoutVersionId', v_loadout_version_id,
        'loadoutCreated', v_loadout_created
    );
end;
$$;

revoke all on function public.ensure_player_character(uuid) from public;
revoke all on function public.ensure_player_character(uuid) from anon;
grant execute on function public.ensure_player_character(uuid)
    to service_role, authenticated;

comment on function public.ensure_player_character(uuid) is
  'B5+E2+E7+0038: idempotent player character + starter loadout; grants A6 paints/weapons when owned quantity < 1. service_role or owning authenticated.';

-- ---------------------------------------------------------------------------
-- get_owned_character: always ensure (idempotent inventory sync)
-- ---------------------------------------------------------------------------
create or replace function public.get_owned_character()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_character_id text;
  v_display_name text;
  v_deleted_at timestamptz;
  v_ensure jsonb;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: get_owned_character requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  select a.deleted_at into v_deleted_at
    from public.accounts a
   where a.id = v_caller;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'account_deleted',
      'message', 'account has been deleted'
    );
  end if;

  -- Always ensure: creates character when missing AND grants any new starter
  -- catalogue parts (A6 paints/weapons) for returning players.
  v_ensure := public.ensure_player_character(v_caller);
  if coalesce((v_ensure->>'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', coalesce(v_ensure->>'code', 'no_character'),
      'message', coalesce(
        v_ensure->>'message',
        'account has no player character'
      )
    );
  end if;

  v_character_id := v_ensure->>'characterId';
  v_display_name := v_ensure->>'displayName';

  if v_character_id is null or v_character_id = '' then
    select c.character_id, c.display_name
      into v_character_id, v_display_name
      from public.characters c
     where c.account_id = v_caller
       and c.is_opponent = false
     order by c.character_id asc
     limit 1;
  end if;

  if v_character_id is null or v_character_id = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_character',
      'message', 'account has no player character'
    );
  end if;

  -- Prefer live characters.display_name (rename_owned_character) over ensure payload.
  select c.display_name
    into v_display_name
    from public.characters c
   where c.character_id = v_character_id
     and c.account_id = v_caller
     and c.is_opponent = false;

  return jsonb_build_object(
    'ok', true,
    'characterId', v_character_id,
    'displayName', coalesce(nullif(v_display_name, ''), v_character_id)
  );
end;
$$;

revoke all on function public.get_owned_character() from public;
revoke all on function public.get_owned_character() from anon;
revoke all on function public.get_owned_character() from service_role;
grant execute on function public.get_owned_character() to authenticated;

comment on function public.get_owned_character() is
  'Sanctioned client read: owned player character for auth.uid(). Always runs ensure_player_character so starter/A6 inventory grants sync for returning players (0038).';

-- ---------------------------------------------------------------------------
-- save_bot_loadout: ensure inventory before ownership asserts (Equip self-heal)
-- Body mirrors 0028 with authenticated ensure call after ownership gate.
-- ---------------------------------------------------------------------------
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
    v_ensure jsonb;
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
        -- 0038: sync starter/A6 grants before ownership asserts so Equip of
        -- newly unlocked catalogue parts succeeds for returning players.
        v_ensure := public.ensure_player_character(v_caller);
        if coalesce((v_ensure->>'ok')::boolean, false) is not true then
            raise exception 'ensure_player_character_failed: %',
                coalesce(v_ensure->>'message', v_ensure->>'code', 'unknown')
                using errcode = 'P0001';
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
  'Validates ownership + slot compatibility; authenticated re-pins current draft atlas (E1) and ensures A6 inventory grants before asserts (0038); appends immutable loadout version.';

-- ---------------------------------------------------------------------------
-- current_bot_loadouts: tie-break same created_at (tx-stable now()) by version id
-- ---------------------------------------------------------------------------
create or replace view public.current_bot_loadouts
with (security_invoker = true) as
select distinct on (character_id)
    loadout_version_id,
    character_id,
    loadout,
    atlas_version,
    created_at
from public.bot_loadout_versions
order by character_id, created_at desc, loadout_version_id desc;

grant select on public.current_bot_loadouts to authenticated, anon;

comment on view public.current_bot_loadouts is
  'Latest confirmed loadout per character. Ties on created_at break by loadout_version_id desc (0038).';

-- ---------------------------------------------------------------------------
-- Idempotent A6 inventory backfill (safe if 0035 already applied)
-- Inline ledger SUM — avoid STABLE owned_part_quantity in mutating INSERT.
-- ---------------------------------------------------------------------------
insert into public.inventory_ledger (account_id, part_id, delta, reason)
select c.account_id, p.part_id, 1, 'grant'
from public.characters c
join public.accounts a
  on a.id = c.account_id
 and a.deleted_at is null
cross join (
  values
    ('paint-primer'),
    ('paint-ink'),
    ('paint-drab'),
    ('paint-navy'),
    ('paint-frost'),
    ('paint-cinder'),
    ('paint-hazard'),
    ('paint-racing'),
    ('weapon-mace'),
    ('weapon-hammer'),
    ('weapon-spear'),
    ('weapon-shield')
) as p(part_id)
where c.is_opponent = false
  and c.account_id is not null
  and exists (
    select 1 from public.parts_catalogue pc
     where pc.part_id = p.part_id and pc.is_active
  )
  and coalesce((
    select sum(il.delta)::integer
      from public.inventory_ledger il
     where il.account_id = c.account_id
       and il.part_id = p.part_id
  ), 0) < 1;
