-- D11: player-facing paint names + get_owned_character botoreName.
-- Keep catalogue ids: paint-navy (Cobalt visual), paint-cobalt (Petrol),
-- paint-crimson (Oxide). Do not edit 0035.

update public.parts_catalogue
   set display_name = 'Cobalt'
 where part_id = 'paint-navy'
   and display_name is distinct from 'Cobalt';

update public.parts_catalogue
   set display_name = 'Petrol'
 where part_id = 'paint-cobalt'
   and display_name is distinct from 'Petrol';

update public.parts_catalogue
   set display_name = 'Oxide'
 where part_id = 'paint-crimson'
   and display_name is distinct from 'Oxide';

-- Extend get_owned_character with profiles.display_name as botoreName (D11 plates).
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
  v_botore_name text;
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

  -- Inventory is per-account: always ensure so returning players get A6 grants
  -- without changing which bot is active.
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

  select r.character_id, r.display_name
    into v_character_id, v_display_name
    from public._resolve_active_owned_character(v_caller) r;

  if v_character_id is null then
    -- ensure just provisioned the first bot; pin it active (0037 contract).
    v_character_id := v_ensure->>'characterId';
    v_display_name := v_ensure->>'displayName';
    if v_character_id is not null and v_character_id <> '' then
      update public.accounts
         set active_character_id = v_character_id
       where id = v_caller
         and (active_character_id is distinct from v_character_id);
    end if;
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
     and c.is_opponent = false
     and coalesce(c.owner_is_npc, false) = false;

  select p.display_name
    into v_botore_name
    from public.profiles p
   where p.account_id = v_caller;

  return jsonb_build_object(
    'ok', true,
    'characterId', v_character_id,
    'displayName', coalesce(nullif(v_display_name, ''), 'Pilot'),
    'botoreName', coalesce(nullif(v_botore_name, ''), nullif(v_display_name, ''), 'Pilot')
  );
end;
$$;

revoke all on function public.get_owned_character() from public;
revoke all on function public.get_owned_character() from anon;
revoke all on function public.get_owned_character() from service_role;
grant execute on function public.get_owned_character() to authenticated;

comment on function public.get_owned_character() is
  'E4+0038+0042: sanctioned owned active character for auth.uid(). Always ensures inventory; resolves active via _resolve_active_owned_character. Returns {ok, characterId, displayName, botoreName}.';
