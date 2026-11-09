-- 0020: Sanctioned authenticated client read RPCs (ticket B / 1amjtrey2yc)
--
-- SEC #25/#26 (and first-run C3) forbid direct authenticated SELECT grants on
-- characters / fight_allowances. The game client needs three read paths for
-- garage → confirm → fight without table GRANTs:
--   (a) get_owned_character()                         → {characterId, displayName}
--   (b) list_opponent_roster()                        → opponents[{characterId, displayName}]
--   (c) get_fight_allowance_summary(p_account_id)     → {utcDay, allowancesRemaining}
--
-- Contract: internal/c3-b-client-read-rpc-contract.md (C3 adapters already coded).
-- All three are SECURITY DEFINER, search_path pinned, scoped to auth.uid().
-- EXECUTE is granted to authenticated (and service_role for ops/smoke).
-- This migration does NOT GRANT SELECT on characters or fight_allowances.

-- ---------------------------------------------------------------------------
-- (a) Owned character resolve
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
    if v_jwt_role = 'service_role' then
        -- Ops/smoke may call with a sub claim; otherwise require authenticated.
        if v_caller is null then
            raise exception 'forbidden: get_owned_character requires auth.uid()'
                using errcode = '42501';
        end if;
    elsif v_jwt_role = 'authenticated' then
        if v_caller is null then
            raise exception 'forbidden: get_owned_character requires auth.uid()'
                using errcode = '42501';
        end if;
    else
        raise exception 'forbidden: get_owned_character requires authenticated'
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
grant execute on function public.get_owned_character()
    to authenticated, service_role;

comment on function public.get_owned_character() is
  'Sanctioned client read: owned player character for auth.uid(). Returns {ok, characterId, displayName}. No table GRANT.';

-- ---------------------------------------------------------------------------
-- (b) System opponent roster
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
    if v_jwt_role = 'service_role' then
        null; -- roster is non-tenant; service_role may list without a sub
    elsif v_jwt_role = 'authenticated' then
        if v_caller is null then
            raise exception 'forbidden: list_opponent_roster requires auth.uid()'
                using errcode = '42501';
        end if;
    else
        raise exception 'forbidden: list_opponent_roster requires authenticated'
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
grant execute on function public.list_opponent_roster()
    to authenticated, service_role;

comment on function public.list_opponent_roster() is
  'Sanctioned client read: system opponent roster ({characterId, displayName}) for Confirm + prepare_fight_context. No table GRANT.';

-- ---------------------------------------------------------------------------
-- (c) Fight allowance summary for caller
-- ---------------------------------------------------------------------------
create or replace function public.get_fight_allowance_summary(
    p_account_id uuid
)
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
    -- Mirror prepare_fight_context: service_role may query any account;
    -- authenticated callers may only query their own account_id.
    if v_jwt_role = 'service_role' then
        null;
    elsif v_jwt_role = 'authenticated' then
        if v_caller is null or v_caller is distinct from p_account_id then
            raise exception 'forbidden: get_fight_allowance_summary requires matching auth.uid()'
                using errcode = '42501';
        end if;
    else
        raise exception 'forbidden: get_fight_allowance_summary requires authenticated or service_role'
            using errcode = '42501';
    end if;

    if p_account_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'unauthenticated',
            'message', 'account required'
        );
    end if;

    select count(*)::integer
      into v_remaining
      from public.fight_allowances fa
     where fa.account_id = p_account_id
       and fa.utc_day = v_utc_day
       and fa.used_at is null;

    return jsonb_build_object(
        'ok', true,
        'utcDay', v_utc_day,
        'allowancesRemaining', coalesce(v_remaining, 0)
    );
end;
$$;

revoke all on function public.get_fight_allowance_summary(uuid) from public;
revoke all on function public.get_fight_allowance_summary(uuid) from anon;
grant execute on function public.get_fight_allowance_summary(uuid)
    to authenticated, service_role;

comment on function public.get_fight_allowance_summary(uuid) is
  'Sanctioned client read: allowance summary {utcDay, allowancesRemaining} for p_account_id (auth.uid() match). Server UTC. No table GRANT.';
