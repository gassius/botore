-- 0034: list_opponent_roster — Botore name + W–L for D8 Opponents cards
-- Prefix 0034: #84 owns 0032 fight quota; #88 owns 0033 A6 paints/weapons.
--
-- ClickUp: D8 Opponents (1amjtrezebu) · E3 (1amjtrezeba)
-- Carlos yes: 2026-11-18 (supervisor GO on draft #84).
--
-- Extends sanctioned client read RPC only. No new table GRANTs to
-- authenticated / anon. EXECUTE remains authenticated-only.

create or replace function public.list_opponent_roster()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_opponents jsonb;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: list_opponent_roster requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'characterId', c.character_id,
                'displayName', c.display_name,
                'botoreName', nullif(trim(both from p.display_name), ''),
                'wins', coalesce(rec.wins, 0),
                'losses', coalesce(rec.losses, 0)
            )
            order by c.character_id asc
        ),
        '[]'::jsonb
    )
      into v_opponents
      from public.characters c
      left join public.profiles p on p.account_id = c.account_id
      left join public.bot_fight_records rec on rec.character_id = c.character_id
     where c.is_opponent = true;

    return jsonb_build_object(
        'ok', true,
        'opponents', v_opponents
    );
end;
$$;

revoke all on function public.list_opponent_roster() from public;
revoke all on function public.list_opponent_roster() from anon;
revoke all on function public.list_opponent_roster() from service_role;
grant execute on function public.list_opponent_roster() to authenticated;

comment on function public.list_opponent_roster() is
  'Sanctioned client read: system opponent roster for authenticated auth.uid(). Returns {ok, opponents:[{characterId, displayName, botoreName, wins, losses}]}. EXECUTE authenticated only. No table GRANT.';
