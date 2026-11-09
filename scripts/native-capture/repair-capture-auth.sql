-- Repair seed GoTrue user for C3 live-fight capture (dev-player@example.com).
-- Idempotent. Password: local-only-password

update auth.users
   set email = 'dev-player@example.com',
       encrypted_password = crypt('local-only-password', gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       confirmation_token = '',
       recovery_token = '',
       email_change_token_new = '',
       email_change = '',
       email_change_token_current = '',
       email_change_confirm_status = 0,
       raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
       updated_at = now()
 where id = '00000000-0000-4000-8000-000000000001'::uuid;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-000000000001',
    'email', 'dev-player@example.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  '00000000-0000-4000-8000-000000000001',
  now(), now(), now()
)
on conflict (provider_id, provider) do update
  set identity_data = excluded.identity_data,
      user_id = excluded.user_id,
      updated_at = now();
