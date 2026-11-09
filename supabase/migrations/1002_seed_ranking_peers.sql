-- 1002: seed ranking peers — additional player characters + progression XP
-- so list_ranking() has a multi-row authoritative board for local/CI captures.
-- Idempotent. Local development only.

-- Peer accounts ---------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
values
  (
    '00000000-0000-4000-8000-000000000011',
    'rank-peer-a@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    'rank-peer-b@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    'rank-peer-c@botore.local',
    crypt('local-only-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb
  )
on conflict (id) do nothing;

insert into public.accounts (id) values
  ('00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000012'),
  ('00000000-0000-4000-8000-000000000013')
on conflict do nothing;

insert into public.profiles (account_id, display_name)
values
  ('00000000-0000-4000-8000-000000000011', 'Rank Peer A'),
  ('00000000-0000-4000-8000-000000000012', 'Rank Peer B'),
  ('00000000-0000-4000-8000-000000000013', 'Rank Peer C')
on conflict do nothing;

insert into public.characters (character_id, account_id, display_name, is_opponent) values
  ('peer-bolt', '00000000-0000-4000-8000-000000000011', 'Bolt', false),
  ('peer-clank', '00000000-0000-4000-8000-000000000012', 'Clank', false),
  ('peer-rivet', '00000000-0000-4000-8000-000000000013', 'Rivet', false)
on conflict do nothing;

-- Minimal immutable builds so peers are valid characters ---------------------
insert into public.character_build_versions (
  character_id, hp, strength, agility, speed, weapon_kind, weapon_power
)
select c.character_id, 30, 5, 5, 6, 'sword', 3
  from public.characters c
 where c.character_id in ('peer-bolt', 'peer-clank', 'peer-rivet')
   and not exists (
     select 1
       from public.character_build_versions b
      where b.character_id = c.character_id
   );

-- Authoritative XP totals via progression_ledger (win=2 / loss=1 awards).
-- battle_id left null: seed-only ledger totals for ranking board density.
-- Idempotent: insert the whole peer pack only when that character has no rows.
do $$
begin
  if not exists (
    select 1 from public.progression_ledger where character_id = 'peer-bolt'
  ) then
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000000011', 'peer-bolt', 2, 'battle'),
      ('00000000-0000-4000-8000-000000000011', 'peer-bolt', 2, 'battle'),
      ('00000000-0000-4000-8000-000000000011', 'peer-bolt', 2, 'battle');
  end if;

  if not exists (
    select 1 from public.progression_ledger where character_id = 'peer-clank'
  ) then
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000000012', 'peer-clank', 2, 'battle'),
      ('00000000-0000-4000-8000-000000000012', 'peer-clank', 1, 'battle');
  end if;

  if not exists (
    select 1 from public.progression_ledger where character_id = 'peer-rivet'
  ) then
    insert into public.progression_ledger (account_id, character_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000000013', 'peer-rivet', 1, 'battle');
  end if;
end $$;
