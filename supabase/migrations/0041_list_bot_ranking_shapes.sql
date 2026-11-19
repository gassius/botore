-- 0041: Additive — list_bot_ranking portrait includes A4 shape slots.
-- Ranking rows must show equipped head/body/arms/legs + paint (ShapeKit),
-- not a generic stock helmet. Extends 0029 portrait jsonb; no schema drops.
--
-- ClickUp: Ranking list avatar uses generic helmet not bot loadout (1amjtrezp4w)
-- Standing rule: merge applies to Dev automatically.

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
                    'head', cl.loadout ->> 'head',
                    'body', cl.loadout ->> 'body',
                    'arms', cl.loadout ->> 'arms',
                    'legs', cl.loadout ->> 'legs',
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
  'E2 sanctioned client read: bot ranking (W-L, XP, portrait chassis/paint/weapon/A4 shapes, botore name). No account UUIDs. EXECUTE authenticated only.';

-- Admin view: expose shape columns for ops (additive; service_role only).
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
    coalesce(cl.loadout ->> 'head', null) as portrait_head,
    coalesce(cl.loadout ->> 'body', null) as portrait_body,
    coalesce(cl.loadout ->> 'arms', null) as portrait_arms,
    coalesce(cl.loadout ->> 'legs', null) as portrait_legs,
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
  'E2 admin/ops bot ranking with W-L + portrait parts including A4 shapes (service_role only).';
