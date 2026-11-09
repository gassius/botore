-- 0022: Sanctioned authenticated ranking read RPC (ClickUp C5 / 1amjtrey13p)
--
-- Authoritative first-run ranking: player characters ordered by total XP from
-- progression_ledger (server-owned battle awards: win=2, loss=1). Rank numbers
-- are assigned here — the client must preserve order and must not re-sort.
--
-- SECURITY DEFINER + auth.uid() only. No table GRANTs on characters /
-- progression_ledger / profiles. EXECUTE to authenticated only.

create or replace function public.list_ranking()
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
        raise exception 'forbidden: list_ranking requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'rank', ranked.rank,
                'characterId', ranked.character_id,
                'displayName', ranked.display_name,
                'isCurrentBot', ranked.is_current_bot,
                'totalXp', ranked.total_xp
            )
            order by ranked.rank asc
        ),
        '[]'::jsonb
    )
      into v_rows
      from (
        select
            row_number() over (
                order by coalesce(xp.total_xp, 0) desc, c.character_id asc
            )::integer as rank,
            c.character_id,
            c.display_name,
            (c.account_id = v_caller) as is_current_bot,
            coalesce(xp.total_xp, 0)::integer as total_xp
          from public.characters c
          left join (
            select pl.character_id, sum(pl.delta_xp)::integer as total_xp
              from public.progression_ledger pl
             group by pl.character_id
          ) xp on xp.character_id = c.character_id
         where c.is_opponent = false
         order by coalesce(xp.total_xp, 0) desc, c.character_id asc
         limit 50
      ) ranked;

    return jsonb_build_object(
        'ok', true,
        'rows', v_rows
    );
end;
$$;

revoke all on function public.list_ranking() from public;
revoke all on function public.list_ranking() from anon;
revoke all on function public.list_ranking() from service_role;
grant execute on function public.list_ranking() to authenticated;

comment on function public.list_ranking() is
  'Sanctioned client read: player ranking by progression_ledger XP totals. Returns {ok, rows:[{rank, characterId, displayName, isCurrentBot, totalXp}]}. EXECUTE authenticated only. No table GRANT.';
