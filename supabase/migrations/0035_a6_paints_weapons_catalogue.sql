-- 0035: A6 paints (v4) + weapons unlock for customise / first-run.
-- Prefix 0035: #84 owns 0032 + 0033 (not mirrored on this branch).
-- #88 owns 0034 rename_owned_character + 0035 A6 paints/weapons only.
--
-- Carlos yes required before apply / merge (Supabase Infra owns migrations).
--
-- Catalogue expansion:
--   * 8 new paints: primer, ink, drab, navy (cobalt visual), frost, cinder,
--     hazard, racing. Legacy paint-crimson→Oxide / paint-cobalt→Petrol stay.
--   * 4 new weapons: mace, hammer, spear, shield (all slot_kind=weapon).
--     weapon_kind stays combat-v1 (sword|axe|dagger) as a proxy so fight
--     resolution does not need a combat-engine rulesVersion bump yet:
--       mace/hammer → axe, spear → sword, shield → dagger.
--     Visual / kit id is the part_id (weapon-mace etc.).
--
-- Grants: expand ensure_player_character starter inventory (mirrors 0029 body)
-- and backfill existing player accounts.
--
-- A5 roster rename (Rivet/Brace → Rivet Nan / Cobalt Brute etc.) is follow-up;
-- client ships apps/game/assets/a5fix/npcs.json separately.

-- ---------------------------------------------------------------------------
-- New paints
-- ---------------------------------------------------------------------------
insert into public.parts_catalogue (
    part_id, slot_kind, display_name, weapon_kind, weapon_power,
    sound_tags, compatibility, media_key, is_active
) values
  ('paint-primer', 'paint', 'Primer', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-primer', true),
  ('paint-ink', 'paint', 'Ink', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-ink', true),
  ('paint-drab', 'paint', 'Drab', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-drab', true),
  ('paint-navy', 'paint', 'Cobalt', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-navy', true),
  ('paint-frost', 'paint', 'Frost', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-frost', true),
  ('paint-cinder', 'paint', 'Cinder', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-cinder', true),
  ('paint-hazard', 'paint', 'Hazard', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-hazard', true),
  ('paint-racing', 'paint', 'Racing', null, null, '[]'::jsonb, '{}'::jsonb, 'parts/paint-racing', true)
on conflict (part_id) do nothing;

-- ---------------------------------------------------------------------------
-- New weapons (combat-v1 weapon_kind proxies — see header)
-- ---------------------------------------------------------------------------
insert into public.parts_catalogue (
    part_id, slot_kind, display_name, weapon_kind, weapon_power,
    sound_tags, compatibility, media_key, is_active
) values
  (
    'weapon-mace', 'weapon', 'Mace', 'axe', 5,
    '["weapon.mace"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-mace', true
  ),
  (
    'weapon-hammer', 'weapon', 'Hammer', 'axe', 5,
    '["weapon.hammer"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-hammer', true
  ),
  (
    'weapon-spear', 'weapon', 'Spear', 'sword', 3,
    '["weapon.spear"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-spear', true
  ),
  (
    'weapon-shield', 'weapon', 'Shield', 'dagger', 2,
    '["weapon.shield"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-shield', true
  )
on conflict (part_id) do nothing;

-- ---------------------------------------------------------------------------
-- ensure_player_character: expanded starter grants (CREATE OR REPLACE)
-- Body mirrors 0029 with A6 paint/weapon inventory.
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
        if exists (
            select 1 from public.parts_catalogue pc
             where pc.part_id = v_part_id and pc.is_active
        ) and not exists (
            select 1 from public.inventory_ledger il
             where il.account_id = p_account_id
               and il.part_id = v_part_id
               and il.reason in ('grant', 'seed', 'admin', 'purchase')
               and il.delta > 0
        ) then
            insert into public.inventory_ledger (account_id, part_id, delta, reason)
            values (p_account_id, v_part_id, 1, 'grant');
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
  'B5+E2+E7: idempotent player character + starter loadout; grants A6 paints/weapons. service_role or owning authenticated.';

-- ---------------------------------------------------------------------------
-- Backfill inventory for existing player accounts (idempotent)
-- ---------------------------------------------------------------------------
insert into public.inventory_ledger (account_id, part_id, delta, reason)
select c.account_id, p.part_id, 1, 'grant'
from public.characters c
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
  and not exists (
    select 1 from public.inventory_ledger il
     where il.account_id = c.account_id
       and il.part_id = p.part_id
       and il.reason in ('grant', 'seed', 'admin', 'purchase')
       and il.delta > 0
  );
