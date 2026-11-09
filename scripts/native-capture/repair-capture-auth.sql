-- Repair seed GoTrue user for C3 live-fight capture (dev-player@example.com).
-- Idempotent. Password: local-only-password
-- Kept in sync with prepare-live-fight-backend.mjs / backend-smoke.mjs repair.

do $$
declare
  uid uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  has_provider_id boolean;
begin
  update auth.users
     set instance_id = '00000000-0000-0000-0000-000000000000',
         aud = 'authenticated',
         role = 'authenticated',
         email = 'dev-player@example.com',
         encrypted_password = crypt('local-only-password', gen_salt('bf')),
         email_confirmed_at = now(),
         confirmation_token = '',
         recovery_token = '',
         email_change_token_new = '',
         email_change = '',
         raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
         raw_user_meta_data = '{}'::jsonb,
         created_at = coalesce(created_at, now()),
         updated_at = now()
   where id = uid;

  if not found then
    raise exception 'auth.users seed row missing for %', uid;
  end if;

  begin
    execute format(
      'update auth.users set
         email_change_token_current = %L,
         email_change_confirm_status = 0,
         phone_change = %L,
         phone_change_token = %L,
         reauthentication_token = %L,
         is_sso_user = false,
         is_anonymous = false
       where id = %L',
      '', '', '', '', uid
    );
  exception
    when undefined_column then null;
  end;

  if to_regclass('auth.identities') is null then
    return;
  end if;

  delete from auth.identities where user_id = uid;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) into has_provider_id;

  if has_provider_id then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object(
        'sub', uid::text,
        'email', 'dev-player@example.com',
        'email_verified', true,
        'phone_verified', false
      ),
      'email', uid::text, now(), now(), now()
    );
  else
    insert into auth.identities (
      id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object(
        'sub', uid::text,
        'email', 'dev-player@example.com',
        'email_verified', true,
        'phone_verified', false
      ),
      'email', now(), now(), now()
    );
  end if;
end $$;
