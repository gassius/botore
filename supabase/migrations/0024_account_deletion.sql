-- 0024: R5 account deletion (soft-delete + anonymize)
--
-- Hard-delete of accounts is blocked by append-only ledgers and non-cascade
-- battle FKs. Policy: keep tombstone rows, anonymize display names, unlink
-- platform identities, store a one-time web deletion-code hash, set deleted_at.
-- Auth email rewrite + ban happen in Edge `account-delete` (service_role).
--
-- No new client table GRANTs. EXECUTE:
--   mint_my_deletion_code / delete_my_account → authenticated only
--   admin_delete_account* → service_role only (Edge)

alter table public.accounts
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_code_hash text;

comment on column public.accounts.deleted_at is
  'R5 soft-delete timestamp. Non-null accounts must not mint sessions or play.';

comment on column public.accounts.deletion_code_hash is
  'R5 sha256 hex of one-time public web deletion code (lowercase hex, no dashes). Cleared on delete.';

create unique index if not exists accounts_deletion_code_hash_uidx
  on public.accounts (deletion_code_hash)
  where deletion_code_hash is not null;

-- ---------------------------------------------------------------------------
-- Shared anonymize body (SECURITY DEFINER helpers call this)
-- ---------------------------------------------------------------------------
create or replace function public._anonymize_deleted_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.profiles
     set display_name = 'Deleted'
   where account_id = p_account_id;

  update public.characters
     set display_name = 'Deleted'
   where account_id = p_account_id
     and is_opponent = false;

  delete from public.player_identities
   where account_id = p_account_id;

  delete from public.devices
   where account_id = p_account_id;

  delete from public.consents
   where account_id = p_account_id;

  update public.battles
     set initiator_account_id = null
   where initiator_account_id = p_account_id;

  update public.accounts
     set deleted_at = coalesce(deleted_at, now()),
         deletion_code_hash = null
   where id = p_account_id;
end;
$$;

revoke all on function public._anonymize_deleted_account(uuid) from public;
revoke all on function public._anonymize_deleted_account(uuid) from anon;
revoke all on function public._anonymize_deleted_account(uuid) from authenticated;
revoke all on function public._anonymize_deleted_account(uuid) from service_role;

comment on function public._anonymize_deleted_account(uuid) is
  'Internal R5 helper: anonymize PII, unlink identities, set deleted_at. Not granted to roles.';

-- ---------------------------------------------------------------------------
-- service_role: delete by account id (Edge JWT path)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_account(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_exists boolean;
  v_deleted_at timestamptz;
begin
  if p_account_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'bad_account',
      'message', 'p_account_id required'
    );
  end if;

  select true, a.deleted_at
    into v_exists, v_deleted_at
    from public.accounts a
   where a.id = p_account_id;

  if not coalesce(v_exists, false) then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'account not found'
    );
  end if;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'repeated', true,
      'accountId', p_account_id
    );
  end if;

  perform public._anonymize_deleted_account(p_account_id);

  return jsonb_build_object(
    'ok', true,
    'repeated', false,
    'accountId', p_account_id
  );
end;
$$;

revoke all on function public.admin_delete_account(uuid) from public;
revoke all on function public.admin_delete_account(uuid) from anon;
revoke all on function public.admin_delete_account(uuid) from authenticated;
grant execute on function public.admin_delete_account(uuid) to service_role;

comment on function public.admin_delete_account(uuid) is
  'R5 Edge-only soft-delete by account id. service_role EXECUTE only.';

-- ---------------------------------------------------------------------------
-- service_role: delete by deletion-code hash (Edge public web path)
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_account_by_code_hash(p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_account_id uuid;
  v_deleted_at timestamptz;
  v_hash text := lower(trim(coalesce(p_code_hash, '')));
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'code', 'bad_code',
      'message', 'deletion code hash must be 64 lowercase hex chars'
    );
  end if;

  select a.id, a.deleted_at
    into v_account_id, v_deleted_at
    from public.accounts a
   where a.deletion_code_hash = v_hash
   limit 1;

  if v_account_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_code',
      'message', 'deletion code not recognized'
    );
  end if;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'repeated', true,
      'accountId', v_account_id
    );
  end if;

  perform public._anonymize_deleted_account(v_account_id);

  return jsonb_build_object(
    'ok', true,
    'repeated', false,
    'accountId', v_account_id
  );
end;
$$;

revoke all on function public.admin_delete_account_by_code_hash(text) from public;
revoke all on function public.admin_delete_account_by_code_hash(text) from anon;
revoke all on function public.admin_delete_account_by_code_hash(text) from authenticated;
grant execute on function public.admin_delete_account_by_code_hash(text) to service_role;

comment on function public.admin_delete_account_by_code_hash(text) is
  'R5 Edge-only soft-delete by sha256 deletion-code hash. service_role EXECUTE only.';

-- ---------------------------------------------------------------------------
-- authenticated: mint one-time web deletion code (plaintext returned once)
-- ---------------------------------------------------------------------------
create or replace function public.mint_my_deletion_code()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_deleted_at timestamptz;
  v_raw text;
  v_hash text;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: mint_my_deletion_code requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  select a.deleted_at into v_deleted_at
    from public.accounts a
   where a.id = v_caller;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'account not found'
    );
  end if;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'already_deleted',
      'message', 'account already deleted'
    );
  end if;

  -- 32 hex chars; clients may display with dashes. Hash is of lowercase hex only.
  v_raw := encode(gen_random_bytes(16), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');

  update public.accounts
     set deletion_code_hash = v_hash
   where id = v_caller
     and deleted_at is null;

  return jsonb_build_object(
    'ok', true,
    'deletionCode', v_raw
  );
end;
$$;

revoke all on function public.mint_my_deletion_code() from public;
revoke all on function public.mint_my_deletion_code() from anon;
revoke all on function public.mint_my_deletion_code() from service_role;
grant execute on function public.mint_my_deletion_code() to authenticated;

comment on function public.mint_my_deletion_code() is
  'R5: mint one-time public web deletion code for auth.uid(). Returns {ok, deletionCode}. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- authenticated: in-app delete (auth.uid() only — no account-id param)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_deleted_at timestamptz;
begin
  if v_jwt_role is distinct from 'authenticated' or v_caller is null then
    raise exception 'forbidden: delete_my_account requires authenticated auth.uid()'
      using errcode = '42501';
  end if;

  select a.deleted_at into v_deleted_at
    from public.accounts a
   where a.id = v_caller;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'account not found'
    );
  end if;

  if v_deleted_at is not null then
    return jsonb_build_object(
      'ok', true,
      'repeated', true,
      'accountId', v_caller
    );
  end if;

  perform public._anonymize_deleted_account(v_caller);

  return jsonb_build_object(
    'ok', true,
    'repeated', false,
    'accountId', v_caller
  );
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
revoke all on function public.delete_my_account() from service_role;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'R5 in-app soft-delete for auth.uid() only. Edge still bans Auth user. EXECUTE authenticated only.';

-- ---------------------------------------------------------------------------
-- Fail closed: owned-character read rejects soft-deleted accounts
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
  v_deleted_at timestamptz;
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
