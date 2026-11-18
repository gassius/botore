-- 0034: rename_owned_character — D7 nameplate persistence
-- Prefix 0034: #84 owns 0032 fight quota + 0033 list_opponent_roster Botore/W–L
-- (not mirrored here — #88 keeps only 0034+0035 until restack/merge).
-- #88 owns 0034 rename + 0035 A6 paints/weapons.
--
-- ClickUp: E7 / D7 Customise (1amjtrezebf / 1amjtrezebt)
-- Carlos yes: 2026-11-18 (supervisor GO on draft #88 rename migration).
--
-- Sanctioned authenticated WRITE RPC. No table GRANTs to authenticated/anon.
-- Client must never UPDATE characters directly. Authz: auth.uid() only.

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

    v_name := trim(both from coalesce(p_display_name, ''));
    if v_name = '' then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_display_name',
            'message', 'display name is required'
        );
    end if;

    -- D7 nameplate caps at 12; table allows up to 48 — keep UI contract.
    if char_length(v_name) > 12 then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_display_name',
            'message', 'display name must be 12 characters or fewer'
        );
    end if;

    -- Reject shapes that must never become player-facing labels (C16/C17).
    if v_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_name ~* '^(player-hero|player-|opp-|bot-)'
       or v_name ~* '@players\.botore\.internal$'
       or v_name ~* '^(device:|G:\d+|teamPlayerID|player_id)$' then
        return jsonb_build_object(
            'ok', false,
            'code', 'invalid_display_name',
            'message', 'display name is not allowed'
        );
    end if;

    select c.character_id
      into v_character_id
      from public.characters c
     where c.account_id = v_caller
       and c.is_opponent = false
     order by c.character_id asc
     limit 1
     for update;

    if v_character_id is null then
        return jsonb_build_object(
            'ok', false,
            'code', 'no_character',
            'message', 'account has no player character'
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
  'Sanctioned client write: rename owned player character display_name for auth.uid(). Returns {ok, characterId, displayName}. EXECUTE authenticated only. No table GRANT.';
