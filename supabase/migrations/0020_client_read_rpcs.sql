-- 0020: Sanctioned authenticated client read RPCs (ticket B / 1amjtrey2yc)
--
-- SEC #25/#26 (and first-run C3) forbid direct authenticated SELECT grants on
-- characters / fight_allowances. The game client needs three read paths for
-- garage → confirm → fight without table GRANTs:
--   (a) get_owned_character()                         → {characterId, displayName}
--   (b) list_opponent_roster()                        → opponents[{characterId, displayName}]
--   (c) get_fight_allowance_summary()                 → {utcDay, allowancesRemaining}
--
-- PRR (gasnet on #30) + C3 tip: SECURITY DEFINER derives account from
-- auth.uid() only — no account-id parameter.
-- EXECUTE granted to authenticated only (REVOKE public + anon + service_role).
-- set search_path pinned. No table GRANTs.

-- ---------------------------------------------------------------------------
-- (a) Owned character resolve — auth.uid() only
-- ---------------------------------------------------------------------------
create or replace function public.get_owned_character()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_character_id text;
    v_display_name text;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: get_owned_character requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select c.character_id, c.display_name
      into v_character_id, v_display_name
      from public.characters c
     where c.account_id = v_caller
       and c.is_opponent = false
     limit 1;

    if v_character_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'no_character',
            'message', 'account has no player character'
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'characterId', v_character_id,
        'displayName', v_display_name
    );
end;
$$;

revoke all on function public.get_owned_character() from public;
revoke all on function public.get_owned_character() from anon;
revoke all on function public.get_owned_character() from service_role;
grant execute on function public.get_owned_character() to authenticated;

comment on function public.get_owned_character() is
  'Sanctioned client read: owned player character for auth.uid() only. Returns {ok, characterId, displayName}. EXECUTE authenticated only. No table GRANT.';

-- ---------------------------------------------------------------------------
-- (b) System opponent roster — authenticated auth.uid() required
-- ---------------------------------------------------------------------------
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
                'displayName', c.display_name
            )
            order by c.character_id asc
        ),
        '[]'::jsonb
    )
      into v_opponents
      from public.characters c
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
  'Sanctioned client read: system opponent roster for authenticated auth.uid(). Returns {ok, opponents:[{characterId, displayName}]}. EXECUTE authenticated only. No table GRANT.';

-- ---------------------------------------------------------------------------
-- (c) Fight allowance summary — auth.uid() only (no account-id param)
-- ---------------------------------------------------------------------------
-- Drop any earlier overload from in-flight PR revisions.
drop function if exists public.get_fight_allowance_summary(uuid);

create or replace function public.get_fight_allowance_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caller uuid := auth.uid();
    v_jwt_role text := coalesce(auth.role(), '');
    v_utc_day date := (now() at time zone 'utc')::date;
    v_remaining integer;
begin
    if v_jwt_role is distinct from 'authenticated' or v_caller is null then
        raise exception 'forbidden: get_fight_allowance_summary requires authenticated auth.uid()'
            using errcode = '42501';
    end if;

    select count(*)::integer
      into v_remaining
      from public.fight_allowances fa
     where fa.account_id = v_caller
       and fa.utc_day = v_utc_day
       and fa.used_at is null;

    return jsonb_build_object(
        'ok', true,
        'utcDay', v_utc_day,
        'allowancesRemaining', coalesce(v_remaining, 0)
    );
end;
$$;

revoke all on function public.get_fight_allowance_summary() from public;
revoke all on function public.get_fight_allowance_summary() from anon;
revoke all on function public.get_fight_allowance_summary() from service_role;
grant execute on function public.get_fight_allowance_summary() to authenticated;

comment on function public.get_fight_allowance_summary() is
  'Sanctioned client read: allowance summary {utcDay, allowancesRemaining} for auth.uid() only. EXECUTE authenticated only. No table GRANT.';
