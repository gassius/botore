-- 0037: E4 multiple bots per player — create / name / select (cap from config)
-- ClickUp: https://app.clickup.com/t/1amjtrezebb
-- Carlos yes: 2026-11-18 (ordered Ludus stack E4→D5→D6).
--
-- Replaces the one-human-bot unique index with a config-backed cap (default 3).
-- Adds active_character_id on accounts, list/create/select/suggest RPCs.
-- First auth still auto-provisions one bot via ensure / get_owned.
-- No table GRANTs to authenticated/anon. Client never writes characters directly.

-- ---------------------------------------------------------------------------
-- Config singleton (mirror fight_quota_config pattern)
-- ---------------------------------------------------------------------------
create table if not exists public.player_bot_config (
    id boolean primary key default true check (id),
    bot_limit integer not null
        check (bot_limit >= 1 and bot_limit <= 12),
    updated_at timestamptz not null default now()
);

comment on table public.player_bot_config is
  'E4: singleton max owned player bots per human account. Client reads via list_owned_characters / create RPCs only.';

comment on column public.player_bot_config.bot_limit is
  'Max player bots per human account (3 now; raise without an app ship).';

insert into public.player_bot_config (id, bot_limit)
values (true, 3)
on conflict (id) do nothing;

alter table public.player_bot_config enable row level security;

revoke all on table public.player_bot_config from public;
revoke all on table public.player_bot_config from anon;
revoke all on table public.player_bot_config from authenticated;

-- ---------------------------------------------------------------------------
-- Active bot pointer on accounts
-- ---------------------------------------------------------------------------
alter table public.accounts
  add column if not exists active_character_id text;

comment on column public.accounts.active_character_id is
  'E4: currently selected player bot (characters.character_id). Null until first provision / select.';

-- FK after column exists; characters may be deleted with account cascade.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'accounts_active_character_id_fkey'
  ) then
    alter table public.accounts
      add constraint accounts_active_character_id_fkey
      foreign key (active_character_id)
      references public.characters (character_id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Drop one-bot unique index; enforce cap via trigger
-- ---------------------------------------------------------------------------
drop index if exists public.one_character_per_human_player;

create or replace function public._player_bot_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bot_limit from public.player_bot_config where id is true),
    3
  );
$$;

revoke all on function public._player_bot_limit() from public;
revoke all on function public._player_bot_limit() from anon;
revoke all on function public._player_bot_limit() from authenticated;
grant execute on function public._player_bot_limit() to service_role;

create or replace function public._enforce_player_bot_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_limit integer;
begin
  if new.account_id is null
     or new.is_opponent = true
     or coalesce(new.owner_is_npc, false) = true then
    return new;
  end if;

  v_limit := public._player_bot_limit();
  select count(*)::integer
    into v_count
    from public.characters c
   where c.account_id = new.account_id
     and c.is_opponent = false
     and coalesce(c.owner_is_npc, false) = false
     and (tg_op = 'INSERT' or c.character_id is distinct from new.character_id);

  if v_count >= v_limit then
    raise exception 'bot_cap_reached: account already owns % of % bots',
      v_count, v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_player_bot_cap on public.characters;
create trigger trg_enforce_player_bot_cap
  before insert on public.characters
  for each row
  execute function public._enforce_player_bot_cap();

-- ---------------------------------------------------------------------------
-- Shared display-name validation (create + rename)
-- ---------------------------------------------------------------------------
create or replace function public._validate_bot_display_name(p_display_name text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := trim(both from coalesce(p_display_name, ''));
  if v_name = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_display_name',
      'message', 'Pick a name for your bot'
    );
  end if;

  if char_length(v_name) > 12 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_display_name',
      'message', 'Name must be 12 characters or fewer'
    );
  end if;

  -- C16/C17 + reserved shapes
  if v_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_name ~* '^(player-hero|player-|opp-|bot-)'
     or v_name ~* '@players\.botore\.internal$'
     or v_name ~* '^(device:|G:\d+|teamPlayerID|player_id)$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_display_name',
      'message', 'That name is not allowed'
    );
  end if;

  -- Curated deny list (case-insensitive whole-word / substring for short insults).
  if lower(v_name) ~ '(fuck|shit|cunt|nigg|faggot|rape|retard|whore|slut|bastard|asshole|dick|piss|cock|porn|pedo)' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_display_name',
      'message', 'That name is not allowed'
    );
  end if;

  return jsonb_build_object('ok', true, 'displayName', v_name);
end;
$$;

revoke all on function public._validate_bot_display_name(text) from public;
revoke all on function public._validate_bot_display_name(text) from anon;
revoke all on function public._validate_bot_display_name(text) from authenticated;
grant execute on function public._validate_bot_display_name(text) to service_role;

-- ---------------------------------------------------------------------------
-- Random fitting name (gladiator / bot tone)
-- ---------------------------------------------------------------------------
create or replace function public.suggest_bot_name()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_left text[] := array[
    'Rust', 'Tin', 'Iron', 'Bolt', 'Scrap', 'Gear', 'Oxide', 'Rivet', 'Cog',
    'Steel', 'Brass', 'Copper', 'Chrome', 'Spark', 'Volt', 'Ash', 'Forge',
    'Glint', 'Ember', 'Flux'
  ];
  v_right text[] := array[
    'Baron', 'Caesar', 'Pilot', 'Knight', 'Rex', 'Anvil', 'Lance', 'Warden',
    'Titan', 'Scout', 'Drone', 'Blade', 'Crown', 'Forge', 'Hawk', 'Viper',
    'Sentry', 'Oracle', 'Gladius', 'Aegis'
  ];
  v_attempt integer;
  v_name text;
  v_left_i integer;
  v_right_i integer;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: suggest_bot_name requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  for v_attempt in 1..24 loop
    v_left_i := 1 + (get_byte(gen_random_bytes(1), 0) % array_length(v_left, 1));
    v_right_i := 1 + (get_byte(gen_random_bytes(1), 0) % array_length(v_right, 1));
    v_name := v_left[v_left_i] || ' ' || v_right[v_right_i];
    if char_length(v_name) > 12 then
      continue;
    end if;
    if exists (
      select 1 from public.characters c
       where c.account_id = v_caller
         and c.is_opponent = false
         and lower(c.display_name) = lower(v_name)
    ) then
      continue;
    end if;
    return jsonb_build_object('ok', true, 'displayName', v_name);
  end loop;

  -- Fallback short name that still passes validation.
  v_name := 'Bot ' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
  return jsonb_build_object('ok', true, 'displayName', v_name);
end;
$$;

revoke all on function public.suggest_bot_name() from public;
revoke all on function public.suggest_bot_name() from anon;
revoke all on function public.suggest_bot_name() from service_role;
grant execute on function public.suggest_bot_name() to authenticated;

comment on function public.suggest_bot_name() is
  'E4: suggest a random fitting bot display name for auth.uid(). Returns {ok, displayName}. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- Helper: resolve active owned character (or first, set active)
-- ---------------------------------------------------------------------------
create or replace function public._resolve_active_owned_character(p_account_id uuid)
returns table (character_id text, display_name text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_active text;
  v_id text;
  v_name text;
begin
  select a.active_character_id into v_active
    from public.accounts a
   where a.id = p_account_id;

  if v_active is not null then
    select c.character_id, c.display_name
      into v_id, v_name
      from public.characters c
     where c.character_id = v_active
       and c.account_id = p_account_id
       and c.is_opponent = false
       and coalesce(c.owner_is_npc, false) = false;
    if v_id is not null then
      character_id := v_id;
      display_name := v_name;
      return next;
      return;
    end if;
  end if;

  select c.character_id, c.display_name
    into v_id, v_name
    from public.characters c
   where c.account_id = p_account_id
     and c.is_opponent = false
     and coalesce(c.owner_is_npc, false) = false
   order by c.created_at asc, c.character_id asc
   limit 1;

  if v_id is not null then
    update public.accounts
       set active_character_id = v_id
     where id = p_account_id
       and (active_character_id is distinct from v_id);
    character_id := v_id;
    display_name := v_name;
    return next;
  end if;
end;
$$;

revoke all on function public._resolve_active_owned_character(uuid) from public;
revoke all on function public._resolve_active_owned_character(uuid) from anon;
revoke all on function public._resolve_active_owned_character(uuid) from authenticated;
grant execute on function public._resolve_active_owned_character(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- get_owned_character — prefer active bot; still auto-provisions first
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

  select r.character_id, r.display_name
    into v_character_id, v_display_name
    from public._resolve_active_owned_character(v_caller) r;

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
    update public.accounts
       set active_character_id = v_character_id
     where id = v_caller
       and (active_character_id is distinct from v_character_id);
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
    'displayName', coalesce(nullif(v_display_name, ''), 'Pilot')
  );
end;
$$;

revoke all on function public.get_owned_character() from public;
revoke all on function public.get_owned_character() from anon;
revoke all on function public.get_owned_character() from service_role;
grant execute on function public.get_owned_character() to authenticated;

comment on function public.get_owned_character() is
  'E4: sanctioned owned active character for auth.uid(). Auto-provisions first bot when missing. Returns {ok, characterId, displayName}.';

-- ---------------------------------------------------------------------------
-- list_owned_characters — collection + cap + active
-- ---------------------------------------------------------------------------
-- VOLATILE: may ensure_player_character + UPDATE accounts.active_character_id
create or replace function public.list_owned_characters()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_deleted_at timestamptz;
  v_active text;
  v_cap integer;
  v_ensure jsonb;
  v_bots jsonb;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: list_owned_characters requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  select a.deleted_at, a.active_character_id
    into v_deleted_at, v_active
    from public.accounts a
   where a.id = v_caller;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'account_deleted',
      'message', 'account has been deleted'
    );
  end if;

  if not exists (
    select 1 from public.characters c
     where c.account_id = v_caller
       and c.is_opponent = false
       and coalesce(c.owner_is_npc, false) = false
  ) then
    v_ensure := public.ensure_player_character(v_caller);
    if coalesce((v_ensure->>'ok')::boolean, false) is not true then
      return jsonb_build_object(
        'ok', false,
        'code', coalesce(v_ensure->>'code', 'no_character'),
        'message', coalesce(v_ensure->>'message', 'account has no player character')
      );
    end if;
    update public.accounts
       set active_character_id = v_ensure->>'characterId'
     where id = v_caller
       and (active_character_id is distinct from (v_ensure->>'characterId'));
    select a.active_character_id into v_active
      from public.accounts a where a.id = v_caller;
  end if;

  -- Heal stale / missing active pointer.
  perform public._resolve_active_owned_character(v_caller);
  select a.active_character_id into v_active
    from public.accounts a where a.id = v_caller;

  v_cap := public._player_bot_limit();

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'characterId', c.character_id,
               'displayName', c.display_name,
               'wins', coalesce(rec.wins, 0),
               'losses', coalesce(rec.losses, 0),
               'paint', cl.loadout ->> 'paint',
               'weapon', cl.loadout ->> 'weapon',
               'atlasVersion', cl.atlas_version,
               'isActive', (c.character_id = v_active)
             )
             order by c.created_at asc, c.character_id asc
           ),
           '[]'::jsonb
         )
    into v_bots
    from public.characters c
    left join public.bot_fight_records rec on rec.character_id = c.character_id
    left join public.current_bot_loadouts cl on cl.character_id = c.character_id
   where c.account_id = v_caller
     and c.is_opponent = false
     and coalesce(c.owner_is_npc, false) = false;

  return jsonb_build_object(
    'ok', true,
    'bots', v_bots,
    'cap', v_cap,
    'ownedCount', jsonb_array_length(v_bots),
    'activeCharacterId', v_active
  );
end;
$$;

revoke all on function public.list_owned_characters() from public;
revoke all on function public.list_owned_characters() from anon;
revoke all on function public.list_owned_characters() from service_role;
grant execute on function public.list_owned_characters() to authenticated;

comment on function public.list_owned_characters() is
  'E4: list owned player bots + cap + active for auth.uid(). Returns {ok, bots, cap, ownedCount, activeCharacterId}. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- select_active_character
-- ---------------------------------------------------------------------------
create or replace function public.select_active_character(p_character_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_deleted_at timestamptz;
  v_id text;
  v_name text;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: select_active_character requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  select a.deleted_at into v_deleted_at
    from public.accounts a where a.id = v_caller;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'account_deleted',
      'message', 'account has been deleted'
    );
  end if;

  v_id := trim(both from coalesce(p_character_id, ''));
  if v_id = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_character',
      'message', 'Choose one of your bots'
    );
  end if;

  select c.character_id, c.display_name
    into v_id, v_name
    from public.characters c
   where c.character_id = v_id
     and c.account_id = v_caller
     and c.is_opponent = false
     and coalesce(c.owner_is_npc, false) = false;

  if v_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_owned',
      'message', 'That bot is not yours'
    );
  end if;

  update public.accounts
     set active_character_id = v_id
   where id = v_caller;

  return jsonb_build_object(
    'ok', true,
    'characterId', v_id,
    'displayName', v_name
  );
end;
$$;

revoke all on function public.select_active_character(text) from public;
revoke all on function public.select_active_character(text) from anon;
revoke all on function public.select_active_character(text) from service_role;
grant execute on function public.select_active_character(text) to authenticated;

comment on function public.select_active_character(text) is
  'E4: persist active player bot for auth.uid(). Returns {ok, characterId, displayName}. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- create_owned_character — capped create with name + starter paint/weapon
-- ---------------------------------------------------------------------------
create or replace function public.create_owned_character(
  p_display_name text,
  p_paint text default 'paint-crimson',
  p_weapon text default 'weapon-sword'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_deleted_at timestamptz;
  v_name_check jsonb;
  v_name text;
  v_count integer;
  v_cap integer;
  v_paint text;
  v_weapon text;
  v_character_id text;
  v_suffix text;
  v_loadout_version_id uuid;
  v_sound_tags jsonb;
  v_normalized jsonb;
  v_owned_parts boolean;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: create_owned_character requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  select a.deleted_at into v_deleted_at
    from public.accounts a where a.id = v_caller;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'account_deleted',
      'message', 'account has been deleted'
    );
  end if;

  -- Ensure first bot / inventory grants exist before counting.
  if not exists (
    select 1 from public.characters c
     where c.account_id = v_caller
       and c.is_opponent = false
       and coalesce(c.owner_is_npc, false) = false
  ) then
    perform public.ensure_player_character(v_caller);
  end if;

  v_name_check := public._validate_bot_display_name(p_display_name);
  if coalesce((v_name_check->>'ok')::boolean, false) is not true then
    return v_name_check;
  end if;
  v_name := v_name_check->>'displayName';

  if exists (
    select 1 from public.characters c
     where c.account_id = v_caller
       and c.is_opponent = false
       and lower(c.display_name) = lower(v_name)
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'name_taken',
      'message', 'You already have a bot with that name'
    );
  end if;

  v_cap := public._player_bot_limit();
  select count(*)::integer into v_count
    from public.characters c
   where c.account_id = v_caller
     and c.is_opponent = false
     and coalesce(c.owner_is_npc, false) = false;

  if v_count >= v_cap then
    return jsonb_build_object(
      'ok', false,
      'code', 'bot_cap_reached',
      'message', 'Your Ludus is full'
    );
  end if;

  v_paint := coalesce(nullif(trim(both from p_paint), ''), 'paint-crimson');
  v_weapon := coalesce(nullif(trim(both from p_weapon), ''), 'weapon-sword');

  if not exists (
    select 1 from public.parts_catalogue
     where part_id = 'chassis-basic' and is_active
  ) or not exists (
    select 1 from public.parts_catalogue
     where part_id = v_paint and slot = 'paint' and is_active
  ) or not exists (
    select 1 from public.parts_catalogue
     where part_id = v_weapon and slot = 'weapon' and is_active
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'catalogue_incomplete',
      'message', 'That paint or weapon is not available'
    );
  end if;

  -- Must own paint + weapon (inventory ledger). Chassis is always starter-granted.
  select
    exists (
      select 1 from public.inventory_ledger il
       where il.account_id = v_caller
         and il.part_id = v_paint
         and il.reason in ('grant', 'seed', 'admin', 'purchase')
         and il.delta > 0
    )
    and exists (
      select 1 from public.inventory_ledger il
       where il.account_id = v_caller
         and il.part_id = v_weapon
         and il.reason in ('grant', 'seed', 'admin', 'purchase')
         and il.delta > 0
    )
    into v_owned_parts;

  if not v_owned_parts then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_owned',
      'message', 'That paint or weapon is not unlocked yet'
    );
  end if;

  v_suffix := substr(encode(gen_random_bytes(6), 'hex'), 1, 10);
  v_character_id := 'player-' || replace(v_caller::text, '-', '') || '-' || v_suffix;

  begin
    insert into public.characters (
      character_id, account_id, display_name, is_opponent, owner_is_npc
    ) values (
      v_character_id, v_caller, v_name, false, false
    );
  exception
    when raise_exception then
      if sqlerrm like 'bot_cap_reached%' then
        return jsonb_build_object(
          'ok', false,
          'code', 'bot_cap_reached',
          'message', 'Your Ludus is full'
        );
      end if;
      raise;
  end;

  insert into public.character_build_versions (
    character_id, hp, strength, agility, speed, weapon_kind, weapon_power
  ) values (
    v_character_id, 30, 5, 5, 6,
    case
      when v_weapon like '%axe%' then 'axe'
      when v_weapon like '%dagger%' then 'dagger'
      else 'sword'
    end,
    3
  );

  select coalesce(jsonb_agg(tag order by tag), '[]'::jsonb)
    into v_sound_tags
    from (
      select distinct jsonb_array_elements_text(pc.sound_tags) as tag
        from public.parts_catalogue pc
       where pc.part_id in ('chassis-basic', v_weapon)
    ) t
   where tag is not null and tag <> '';

  v_normalized :=
    jsonb_build_object(
      'chassis', 'chassis-basic',
      'paint', v_paint,
      'weapon', v_weapon,
      'decals', '[]'::jsonb,
      'soundTags', coalesce(v_sound_tags, '[]'::jsonb)
    )
    || jsonb_build_object('shield', 'null'::jsonb)
    || jsonb_build_object('drone', 'null'::jsonb);

  insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
  values (v_character_id, v_normalized, 'v1')
  returning loadout_version_id into v_loadout_version_id;

  update public.accounts
     set active_character_id = v_character_id
   where id = v_caller;

  return jsonb_build_object(
    'ok', true,
    'characterId', v_character_id,
    'displayName', v_name,
    'loadoutVersionId', v_loadout_version_id,
    'cap', v_cap,
    'ownedCount', v_count + 1
  );
end;
$$;

revoke all on function public.create_owned_character(text, text, text) from public;
revoke all on function public.create_owned_character(text, text, text) from anon;
revoke all on function public.create_owned_character(text, text, text) from service_role;
grant execute on function public.create_owned_character(text, text, text) to authenticated;

comment on function public.create_owned_character(text, text, text) is
  'E4: create an owned player bot under cap with starter loadout. Returns {ok, characterId, displayName, ...}. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- rename_owned_character — act on active bot (multi-bot safe)
-- ---------------------------------------------------------------------------
create or replace function public.rename_owned_character(
    p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_character_id text;
    v_name_check jsonb;
    v_name text;
    v_deleted_at timestamptz;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: rename_owned_character requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select a.deleted_at
      into v_deleted_at
      from public.accounts a
     where a.id = v_caller;

    if v_deleted_at is not null then
        return jsonb_build_object(
            'ok', false,
            'code', 'account_deleted',
            'message', 'account is deleted'
        );
    end if;

    v_name_check := public._validate_bot_display_name(p_display_name);
    if coalesce((v_name_check->>'ok')::boolean, false) is not true then
      -- Keep legacy message wording for empty / overlong where D7 tests expect.
      if (v_name_check->>'code') = 'invalid_display_name'
         and trim(both from coalesce(p_display_name, '')) = '' then
        return jsonb_build_object(
          'ok', false,
          'code', 'invalid_display_name',
          'message', 'display name is required'
        );
      end if;
      if char_length(trim(both from coalesce(p_display_name, ''))) > 12 then
        return jsonb_build_object(
          'ok', false,
          'code', 'invalid_display_name',
          'message', 'display name must be 12 characters or fewer'
        );
      end if;
      return jsonb_build_object(
        'ok', false,
        'code', 'invalid_display_name',
        'message', 'display name is not allowed'
      );
    end if;
    v_name := v_name_check->>'displayName';

    select r.character_id
      into v_character_id
      from public._resolve_active_owned_character(v_caller) r;

    if v_character_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'no_character',
            'message', 'account has no player character'
        );
    end if;

    if exists (
      select 1 from public.characters c
       where c.account_id = v_caller
         and c.is_opponent = false
         and c.character_id is distinct from v_character_id
         and lower(c.display_name) = lower(v_name)
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'name_taken',
        'message', 'You already have a bot with that name'
      );
    end if;

    update public.characters
       set display_name = v_name
     where character_id = v_character_id
       and account_id = v_caller
       and is_opponent = false;

    return jsonb_build_object(
        'ok', true,
        'characterId', v_character_id,
        'displayName', v_name
    );
end;
$$;

revoke all on function public.rename_owned_character(text) from public;
revoke all on function public.rename_owned_character(text) from anon;
revoke all on function public.rename_owned_character(text) from service_role;
grant execute on function public.rename_owned_character(text) to authenticated;

comment on function public.rename_owned_character(text) is
  'E4/D7: rename the active owned player character display_name for auth.uid(). Returns {ok, characterId, displayName}. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- Backfill active_character_id for existing single-bot accounts
-- ---------------------------------------------------------------------------
update public.accounts a
   set active_character_id = c.character_id
  from (
    select distinct on (account_id)
           account_id, character_id
      from public.characters
     where account_id is not null
       and is_opponent = false
       and coalesce(owner_is_npc, false) = false
     order by account_id, created_at asc, character_id asc
  ) c
 where a.id = c.account_id
   and a.active_character_id is null;
