-- 0027: ensure player character + starter loadout on first auth (B5)
--
-- ClickUp: B5 Ensure player character + starter loadout on first auth (1amjtreyru1)
--
-- Root cause (confirmed on Development): platform-auth creates auth.users +
-- accounts + player_identities only. No characters / build / inventory /
-- loadout / profile. Only player inserts lived in supabase/seed.sql
-- (local/CI — not hosted db push). get_owned_character correctly returned
-- no_character.
--
-- Fix:
--   * Idempotent SECURITY DEFINER ensure_player_character(account_id)
--   * Callable by service_role (platform-auth) or authenticated self (uid match)
--   * get_owned_character auto-provisions when missing (Retry Load works)
--   * Migration backfill for existing accounts (+ orphan auth users)
--
-- Atlas independence: starter loadout is inserted directly into
-- bot_loadout_versions. It does NOT call save_bot_loadout and does NOT
-- require atlas_versions / Storage publish. atlas_version text is pinned
-- to 'v1' for schema compatibility only.

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
    v_created boolean := false;
    v_loadout_created boolean := false;
    v_loadout_version_id uuid;
    v_build_count integer;
    v_part_id text;
    v_today date := (now() at time zone 'utc')::date;
    v_normalized jsonb;
    v_sound_tags jsonb;
begin
    -- Authz via JWT claims only. Never use current_user inside SECURITY DEFINER
    -- (owner is postgres, so current_user is always privileged — see 0014).
    -- Migration backfill sets request.jwt.claim.role = service_role.
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

    -- Auth user may exist without accounts (e.g. web-preview email path).
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

    -- Catalogue must already be present (hosted bootstrap / seed.sql).
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

        insert into public.profiles (account_id, display_name)
        values (p_account_id, v_display_name)
        on conflict (account_id) do nothing;

        begin
            insert into public.characters (
                character_id, account_id, display_name, is_opponent
            ) values (
                v_character_id, p_account_id, v_display_name, false
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
    end if;

    -- Immutable combat build (seed player-hero stats).
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

    -- Starter inventory (reason allowed by 0009 check: grant).
    -- Treat prior seed grants as already owned.
    foreach v_part_id in array array[
        'chassis-basic',
        'paint-crimson',
        'paint-cobalt',
        'weapon-sword',
        'weapon-axe',
        'weapon-dagger'
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

    -- Confirmed starter loadout — direct insert, no atlas_versions / Storage.
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

    -- First-run fight slots for this account (today + tomorrow UTC).
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

comment on function public.ensure_player_character(uuid) is
  'B5: idempotent player character + starter inventory/loadout/allowances. service_role or owning authenticated. Atlas Storage not required.';

revoke all on function public.ensure_player_character(uuid) from public;
revoke all on function public.ensure_player_character(uuid) from anon;
grant execute on function public.ensure_player_character(uuid) to service_role;
grant execute on function public.ensure_player_character(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_owned_character: auto-provision when missing (Retry Load / existing sessions)
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

  select c.character_id, c.display_name
    into v_character_id, v_display_name
    from public.characters c
   where c.account_id = v_caller
     and c.is_opponent = false
   limit 1;

  if v_character_id is null then
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
  end if;

  if v_character_id is null or v_character_id = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_character',
      'message', 'account has no player character'
    );
  end if;

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
  'Sanctioned client read: owned player character for auth.uid(). Auto-provisions via ensure_player_character when missing (B5).';

-- ---------------------------------------------------------------------------
-- Backfill: orphan auth users → accounts, then ensure for every live account
-- without a player character. Known Development ids (prefix match) called out
-- explicitly so Supabase Infra can verify the three Carlos reported.
-- ---------------------------------------------------------------------------
do $$
declare
    r record;
    v_res jsonb;
    v_ok integer := 0;
    v_fail integer := 0;
    v_accounts_created integer := 0;
begin
    perform set_config('request.jwt.claim.role', 'service_role', true);

    -- 1) Create missing accounts for known Development auth users + any
    --    auth.users still lacking an accounts row that we can safely attach
    --    (email match / id prefix from Infra report).
    with orphans as (
        select u.id
          from auth.users u
         where not exists (
             select 1 from public.accounts a where a.id = u.id
         )
           and (
             lower(coalesce(u.email, '')) = 'dev@botore.local'
             or u.id::text like '135fa3fb%'
             or u.id::text like 'a9672255%'
             or u.id::text like '37fb8c5d%'
           )
    ),
    ins as (
        insert into public.accounts (id)
        select id from orphans
        on conflict (id) do nothing
        returning 1
    )
    select count(*)::integer into v_accounts_created from ins;

    raise notice 'B5 ensure_player_character orphan accounts created=%', v_accounts_created;

    -- 2) Ensure every non-deleted account that lacks a player character.
    for r in
        select a.id
          from public.accounts a
         where a.deleted_at is null
           and not exists (
               select 1
                 from public.characters c
                where c.account_id = a.id
                  and c.is_opponent = false
           )
         order by a.created_at asc, a.id asc
    loop
        begin
            v_res := public.ensure_player_character(r.id);
            if coalesce((v_res->>'ok')::boolean, false) then
                v_ok := v_ok + 1;
            else
                v_fail := v_fail + 1;
                raise warning 'ensure_player_character backfill skip %: %',
                    r.id, coalesce(v_res->>'message', v_res->>'code', 'unknown');
            end if;
        exception
            when others then
                v_fail := v_fail + 1;
                raise warning 'ensure_player_character backfill error %: %',
                    r.id, sqlerrm;
        end;
    end loop;

    raise notice 'B5 ensure_player_character backfill: ok=% fail=%', v_ok, v_fail;
end $$;
