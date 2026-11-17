-- 0028: E2 Ranking backend — bot / botore win-loss + ranking RPCs
--
-- ClickUp: E2 Ranking backend (1amjtrezaj2)
--
-- * Derive W-L from server-confirmed battles (winner_id).
-- * Player-facing botore identity (botore_id + emblem) without account UUIDs.
-- * NPC botores may own 1–3 bots (relax one-character unique for owner_is_npc).
-- * Authenticated RPCs: list_bot_ranking / list_botore_ranking.
-- * Admin views for future dashboard reuse (service_role only).
-- * Keep list_ranking() (C5 XP board) unchanged for the live client adapter.

-- ---------------------------------------------------------------------------
-- Schema: NPC flag, botore public id, emblem, multi-bot NPC ownership
-- ---------------------------------------------------------------------------
alter table public.accounts
    add column if not exists is_npc boolean not null default false;

comment on column public.accounts.is_npc is
  'E2: NPC botore accounts (seeded ranking opponents). Not real players.';

alter table public.profiles
    add column if not exists botore_id text,
    add column if not exists emblem_id text not null default 'emblem-default';

comment on column public.profiles.botore_id is
  'E2: player-facing botore id (text). Never an account UUID.';
comment on column public.profiles.emblem_id is
  'E2: emblem asset/key id for botore ranking rows.';

alter table public.characters
    add column if not exists owner_is_npc boolean not null default false;

comment on column public.characters.owner_is_npc is
  'E2: denormalized accounts.is_npc for partial unique index (humans: one bot).';

-- Humans keep one player character; NPC botores may own multiple bots.
drop index if exists public.one_character_per_player;

create unique index if not exists one_character_per_human_player
    on public.characters (account_id)
    where account_id is not null
      and is_opponent = false
      and owner_is_npc = false;

create unique index if not exists profiles_botore_id_uidx
    on public.profiles (botore_id)
    where botore_id is not null;

-- Backfill botore_id from owned character id when present (text ids, not raw uuid).
update public.profiles p
   set botore_id = 'botore-' || c.character_id
  from public.characters c
 where p.botore_id is null
   and c.account_id = p.account_id
   and c.is_opponent = false;

-- Remaining profiles (no character yet): garage-<12 hex> — not UUID-shaped.
update public.profiles p
   set botore_id = 'garage-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
 where p.botore_id is null;

-- Sync owner_is_npc from accounts.
update public.characters c
   set owner_is_npc = a.is_npc
  from public.accounts a
 where c.account_id = a.id
   and c.owner_is_npc is distinct from a.is_npc;

-- ---------------------------------------------------------------------------
-- Win-loss derivation (confirmed fights with a winner_id)
-- ---------------------------------------------------------------------------
create or replace view public.bot_fight_records
with (security_invoker = true) as
select
    bp.character_id,
    count(*) filter (
        where b.winner_id = bp.character_id
    )::integer as wins,
    count(*) filter (
        where b.winner_id is not null
          and b.winner_id is distinct from bp.character_id
    )::integer as losses
from public.battle_participants bp
join public.battles b on b.battle_id = bp.battle_id
group by bp.character_id;

revoke all on table public.bot_fight_records from public;
revoke all on table public.bot_fight_records from anon;
revoke all on table public.bot_fight_records from authenticated;
grant select on table public.bot_fight_records to service_role;

comment on view public.bot_fight_records is
  'E2: per-bot wins/losses derived from battles.winner_id (service_role / definer RPCs).';

create index if not exists battle_participants_character_id_idx
    on public.battle_participants (character_id);

create index if not exists battles_winner_id_idx
    on public.battles (winner_id)
    where winner_id is not null;

-- ---------------------------------------------------------------------------
-- Admin ranking views (dashboard reuse; service_role only)
-- ---------------------------------------------------------------------------
create or replace view public.admin_bot_ranking
with (security_invoker = true) as
select
    row_number() over (
        order by
            coalesce(rec.wins, 0) desc,
            coalesce(xp.total_xp, 0) desc,
            coalesce(rec.losses, 0) asc,
            c.character_id asc
    )::integer as rank,
    c.character_id as bot_id,
    c.display_name as bot_name,
    p.botore_id,
    p.display_name as botore_name,
    coalesce(rec.wins, 0)::integer as wins,
    coalesce(rec.losses, 0)::integer as losses,
    coalesce(xp.total_xp, 0)::integer as total_xp,
    coalesce(cl.loadout ->> 'chassis', null) as portrait_chassis,
    coalesce(cl.loadout ->> 'paint', null) as portrait_paint,
    coalesce(cl.loadout ->> 'weapon', null) as portrait_weapon,
    cl.atlas_version as portrait_atlas_version,
    a.is_npc,
    c.account_id,
    c.created_at as character_created_at
from public.characters c
join public.accounts a on a.id = c.account_id
join public.profiles p on p.account_id = c.account_id
left join public.bot_fight_records rec on rec.character_id = c.character_id
left join (
    select pl.character_id, sum(pl.delta_xp)::integer as total_xp
      from public.progression_ledger pl
     group by pl.character_id
) xp on xp.character_id = c.character_id
left join public.current_bot_loadouts cl on cl.character_id = c.character_id
where c.is_opponent = false
  and a.deleted_at is null
order by
    coalesce(rec.wins, 0) desc,
    coalesce(xp.total_xp, 0) desc,
    coalesce(rec.losses, 0) asc,
    c.character_id asc;

revoke all on table public.admin_bot_ranking from public;
revoke all on table public.admin_bot_ranking from anon;
revoke all on table public.admin_bot_ranking from authenticated;
grant select on table public.admin_bot_ranking to service_role;

comment on view public.admin_bot_ranking is
  'E2 admin/ops bot ranking with W-L + portrait parts (service_role only).';

create or replace view public.admin_botore_ranking
with (security_invoker = true) as
select
    row_number() over (
        order by
            agg.wins desc,
            agg.losses asc,
            agg.bots_owned desc,
            agg.botore_id asc
    )::integer as rank,
    agg.botore_id,
    agg.name,
    agg.emblem_id,
    agg.wins,
    agg.losses,
    agg.bots_owned,
    agg.is_npc,
    agg.account_id,
    agg.account_created_at
from (
    select
        p.botore_id,
        p.display_name as name,
        p.emblem_id,
        coalesce(sum(rec.wins), 0)::integer as wins,
        coalesce(sum(rec.losses), 0)::integer as losses,
        count(c.character_id)::integer as bots_owned,
        a.is_npc,
        a.id as account_id,
        a.created_at as account_created_at
      from public.accounts a
      join public.profiles p on p.account_id = a.id
      join public.characters c
        on c.account_id = a.id
       and c.is_opponent = false
      left join public.bot_fight_records rec on rec.character_id = c.character_id
     where a.deleted_at is null
       and p.botore_id is not null
     group by
        p.botore_id,
        p.display_name,
        p.emblem_id,
        a.is_npc,
        a.id,
        a.created_at
) agg
order by
    agg.wins desc,
    agg.losses asc,
    agg.bots_owned desc,
    agg.botore_id asc;

revoke all on table public.admin_botore_ranking from public;
revoke all on table public.admin_botore_ranking from anon;
revoke all on table public.admin_botore_ranking from authenticated;
grant select on table public.admin_botore_ranking to service_role;

comment on view public.admin_botore_ranking is
  'E2 admin/ops botore ranking with aggregate W-L + bots owned (service_role only).';

-- ---------------------------------------------------------------------------
-- Authenticated client RPCs (no table GRANTs; no account UUIDs in payload)
-- ---------------------------------------------------------------------------
create or replace function public.list_bot_ranking()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_rows jsonb;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: list_bot_ranking requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', ranked.rank,
                'botId', ranked.bot_id,
                'botName', ranked.bot_name,
                'botoreId', ranked.botore_id,
                'botoreName', ranked.botore_name,
                'wins', ranked.wins,
                'losses', ranked.losses,
                'totalXp', ranked.total_xp,
                'portrait', ranked.portrait,
                'isCurrentBot', ranked.is_current_bot,
                'isNpc', ranked.is_npc
            )
            order by ranked.rank asc
        ),
        '[]'::jsonb
    )
      into v_rows
      from (
        select
            row_number() over (
                order by
                    coalesce(rec.wins, 0) desc,
                    coalesce(xp.total_xp, 0) desc,
                    coalesce(rec.losses, 0) asc,
                    c.character_id asc
            )::integer as rank,
            c.character_id as bot_id,
            c.display_name as bot_name,
            p.botore_id,
            p.display_name as botore_name,
            coalesce(rec.wins, 0)::integer as wins,
            coalesce(rec.losses, 0)::integer as losses,
            coalesce(xp.total_xp, 0)::integer as total_xp,
            case
                when cl.loadout is null then null
                else jsonb_build_object(
                    'chassis', cl.loadout ->> 'chassis',
                    'paint', cl.loadout ->> 'paint',
                    'weapon', cl.loadout ->> 'weapon',
                    'atlasVersion', cl.atlas_version
                )
            end as portrait,
            (c.account_id = v_caller) as is_current_bot,
            a.is_npc
          from public.characters c
          join public.accounts a on a.id = c.account_id
          join public.profiles p on p.account_id = c.account_id
          left join public.bot_fight_records rec on rec.character_id = c.character_id
          left join (
            select pl.character_id, sum(pl.delta_xp)::integer as total_xp
              from public.progression_ledger pl
             group by pl.character_id
          ) xp on xp.character_id = c.character_id
          left join public.current_bot_loadouts cl on cl.character_id = c.character_id
         where c.is_opponent = false
           and a.deleted_at is null
           and p.botore_id is not null
         order by
            coalesce(rec.wins, 0) desc,
            coalesce(xp.total_xp, 0) desc,
            coalesce(rec.losses, 0) asc,
            c.character_id asc
         limit 50
      ) ranked;

    return jsonb_build_object(
        'ok', true,
        'tab', 'bots',
        'rows', v_rows
    );
end;
$$;

revoke all on function public.list_bot_ranking() from public;
revoke all on function public.list_bot_ranking() from anon;
revoke all on function public.list_bot_ranking() from service_role;
grant execute on function public.list_bot_ranking() to authenticated;

comment on function public.list_bot_ranking() is
  'E2 sanctioned client read: bot ranking (W-L, XP, portrait parts, botore name). No account UUIDs. EXECUTE authenticated only.';

create or replace function public.list_botore_ranking()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_rows jsonb;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: list_botore_ranking requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', ranked.rank,
                'botoreId', ranked.botore_id,
                'name', ranked.name,
                'emblemId', ranked.emblem_id,
                'wins', ranked.wins,
                'losses', ranked.losses,
                'botsOwned', ranked.bots_owned,
                'isCurrentBotore', ranked.is_current_botore,
                'isNpc', ranked.is_npc
            )
            order by ranked.rank asc
        ),
        '[]'::jsonb
    )
      into v_rows
      from (
        select
            row_number() over (
                order by
                    agg.wins desc,
                    agg.losses asc,
                    agg.bots_owned desc,
                    agg.botore_id asc
            )::integer as rank,
            agg.botore_id,
            agg.name,
            agg.emblem_id,
            agg.wins,
            agg.losses,
            agg.bots_owned,
            agg.is_current_botore,
            agg.is_npc
          from (
            select
                p.botore_id,
                p.display_name as name,
                p.emblem_id,
                coalesce(sum(rec.wins), 0)::integer as wins,
                coalesce(sum(rec.losses), 0)::integer as losses,
                count(c.character_id)::integer as bots_owned,
                bool_or(a.id = v_caller) as is_current_botore,
                bool_or(a.is_npc) as is_npc
              from public.accounts a
              join public.profiles p on p.account_id = a.id
              join public.characters c
                on c.account_id = a.id
               and c.is_opponent = false
              left join public.bot_fight_records rec on rec.character_id = c.character_id
             where a.deleted_at is null
               and p.botore_id is not null
             group by
                p.botore_id,
                p.display_name,
                p.emblem_id
          ) agg
         order by
            agg.wins desc,
            agg.losses asc,
            agg.bots_owned desc,
            agg.botore_id asc
         limit 50
      ) ranked;

    return jsonb_build_object(
        'ok', true,
        'tab', 'botores',
        'rows', v_rows
    );
end;
$$;

revoke all on function public.list_botore_ranking() from public;
revoke all on function public.list_botore_ranking() from anon;
revoke all on function public.list_botore_ranking() from service_role;
grant execute on function public.list_botore_ranking() to authenticated;

comment on function public.list_botore_ranking() is
  'E2 sanctioned client read: botore ranking (emblem, aggregate W-L, bots owned). No account UUIDs. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- ensure_player_character: set botore_id / emblem / owner_is_npc on provision
-- (body mirrors 0027 with E2 profile fields)
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
        -- Ensure profile botore_id exists for ranking payloads.
        update public.profiles
           set botore_id = coalesce(
                 botore_id,
                 'botore-' || v_character_id
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

revoke all on function public.ensure_player_character(uuid) from public;
revoke all on function public.ensure_player_character(uuid) from anon;
grant execute on function public.ensure_player_character(uuid)
    to service_role, authenticated;

comment on function public.ensure_player_character(uuid) is
  'B5+E2: idempotent player character + starter loadout; sets botore_id/emblem for ranking. service_role or owning authenticated.';
