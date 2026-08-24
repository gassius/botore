-- 1000: seed data — dev accounts, characters (player + 3 opponents), builds,
-- allowances for today. Safe to run after migrations on a clean database.
--
-- NOTE: local development only. The dev account id is deterministic so the
-- API's default account matches. Passwords/emails here are placeholders.

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'dev-player@botore.local', crypt('local-only-password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}')
on conflict (id) do nothing;

insert into public.accounts (id) values ('00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.profiles (account_id, display_name)
values ('00000000-0000-4000-8000-000000000001', 'Dev Player')
on conflict do nothing;

-- Characters -----------------------------------------------------------------
insert into public.characters (character_id, account_id, display_name, is_opponent) values
  ('player-hero', '00000000-0000-4000-8000-000000000001', 'Hero', false),
  ('opp-sir-bot', null, 'Sir Bot', true),
  ('opp-dex-bot', null, 'Dex Bot', true),
  ('opp-hp-bot',  null, 'Tank Bot', true)
on conflict do nothing;

-- Immutable build versions ----------------------------------------------------
insert into public.character_build_versions (character_id, hp, strength, agility, speed, weapon_kind, weapon_power)
select c.character_id, v.hp, v.strength, v.agility, v.speed, v.weapon_kind, v.weapon_power
from (values
  ('player-hero', 30, 5, 5, 6, 'sword', 3),
  ('opp-sir-bot', 34, 6, 4, 5, 'sword', 3),
  ('opp-dex-bot', 26, 4, 7, 8, 'dagger', 2),
  ('opp-hp-bot',  44, 8, 2, 3, 'axe', 5)
) as v(character_id, hp, strength, agility, speed, weapon_kind, weapon_power)
join public.characters c on c.character_id = v.character_id;

-- Fight allowances: today + tomorrow, three slots each ------------------------
insert into public.fight_allowances (account_id, utc_day, slot_index)
select '00000000-0000-4000-8000-000000000001',
       d::date,
       s.slot_index
from generate_series(
       (now() at time zone 'utc')::date,
       ((now() at time zone 'utc')::date + 1), interval '1 day'
     ) d
cross join (values (1),(2),(3)) as s(slot_index)
on conflict do nothing;
