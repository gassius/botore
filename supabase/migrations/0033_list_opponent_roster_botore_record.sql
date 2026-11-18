-- 0033: list_opponent_roster — Botore name + W–L for D8 Opponents cards
-- Prefix 0033: #84 owns 0032 fight quota; E7/#88 renames paints/weapons to 0034 (after this D8 roster RPC).
--
-- ClickUp: D8 Opponents (1amjtrezebu) · E3 (1amjtrezeba)
-- Carlos yes: 2026-11-18 (supervisor GO on draft #84).
--
-- B1: system opponents stay unowned (opponents_unowned: account_id IS NULL).
-- Lanista / Botore display names link through opponent_lanistas — do not relax
-- the CHECK by putting lanista ids on characters.account_id.
--
-- Extends sanctioned client read RPC only. No new table GRANTs to
-- authenticated / anon. EXECUTE remains authenticated-only.

-- ---------------------------------------------------------------------------
-- Lanista link for system opponents (not ownership)
-- ---------------------------------------------------------------------------
create table if not exists public.opponent_lanistas (
    character_id text primary key
        references public.characters (character_id) on delete cascade,
    lanista_account_id uuid not null
        references public.accounts (id) on delete restrict,
    created_at timestamptz not null default now()
);

comment on table public.opponent_lanistas is
  'D8: maps system opponent characters to lanista accounts for Botore display names. Not ownership — characters.account_id stays null (opponents_unowned).';

alter table public.opponent_lanistas enable row level security;

revoke all on table public.opponent_lanistas from public;
revoke all on table public.opponent_lanistas from anon;
revoke all on table public.opponent_lanistas from authenticated;
-- service_role / postgres retain access for seed + admin; client reads via RPC only.

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
      left join public.opponent_lanistas ol on ol.character_id = c.character_id
      left join public.profiles p on p.account_id = ol.lanista_account_id
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
  'Sanctioned client read: system opponent roster for authenticated auth.uid(). Returns {ok, opponents:[{characterId, displayName, botoreName, wins, losses}]}. Botore name via opponent_lanistas→profiles (not characters.account_id). EXECUTE authenticated only. No table GRANT.';
