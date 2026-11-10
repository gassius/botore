-- Local / CI seed only (supabase db reset). NOT applied by hosted `db push`.
-- Former migrations 1000 / 1001 / 1002 — test logins use shared local-only-password.
-- Do not put production credentials here.

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

-- 1001: bots-as-data seed — proof catalogue + inventory + confirmed loadouts.
-- Idempotent. Minimal proof: 1 chassis, 2 paints, sword/axe/dagger.

insert into public.parts_catalogue (
    part_id, slot_kind, display_name, weapon_kind, weapon_power,
    sound_tags, compatibility, media_key, is_active
) values
  (
    'chassis-basic', 'chassis', 'Basic Frame', null, null,
    '["chassis.light"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/chassis-basic', true
  ),
  (
    'paint-crimson', 'paint', 'Crimson', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-crimson', true
  ),
  (
    'paint-cobalt', 'paint', 'Cobalt', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-cobalt', true
  ),
  (
    'weapon-sword', 'weapon', 'Sword', 'sword', 3,
    '["weapon.sword"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-sword', true
  ),
  (
    'weapon-axe', 'weapon', 'Axe', 'axe', 5,
    '["weapon.axe"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-axe', true
  ),
  (
    'weapon-dagger', 'weapon', 'Dagger', 'dagger', 2,
    '["weapon.dagger"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-dagger', true
  )
on conflict (part_id) do nothing;

-- Grant the full proof kit to the dev player (idempotent via ledger presence).
insert into public.inventory_ledger (account_id, part_id, delta, reason)
select a.account_id, p.part_id, 1, 'seed'
from (values ('00000000-0000-4000-8000-000000000001'::uuid)) as a(account_id)
cross join (
  values
    ('chassis-basic'),
    ('paint-crimson'),
    ('paint-cobalt'),
    ('weapon-sword'),
    ('weapon-axe'),
    ('weapon-dagger')
) as p(part_id)
where not exists (
  select 1 from public.inventory_ledger il
  where il.account_id = a.account_id
    and il.part_id = p.part_id
    and il.reason = 'seed'
);

-- Atlas storage bucket placeholder (local). Hosted project may already have it.
insert into storage.buckets (id, name, public)
values ('atlas', 'atlas', false)
on conflict (id) do nothing;

-- Confirmed loadouts via the server validation function (service_role JWT).
-- Player: crimson + sword. Opponents: contrasting paints / weapons matching
-- existing combat-v1 seed builds.
do $$
begin
  -- save_bot_loadout requires auth.role() = 'service_role' for system path.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  if not exists (
    select 1 from public.current_bot_loadouts where character_id = 'player-hero'
  ) then
    perform public.save_bot_loadout(
      'player-hero',
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-sword"}'::jsonb,
      'v1'
    );
  end if;

  if not exists (
    select 1 from public.current_bot_loadouts where character_id = 'opp-sir-bot'
  ) then
    perform public.save_bot_loadout(
      'opp-sir-bot',
      '{"chassis":"chassis-basic","paint":"paint-cobalt","weapon":"weapon-sword"}'::jsonb,
      'v1'
    );
  end if;

  if not exists (
    select 1 from public.current_bot_loadouts where character_id = 'opp-dex-bot'
  ) then
    perform public.save_bot_loadout(
      'opp-dex-bot',
      '{"chassis":"chassis-basic","paint":"paint-crimson","weapon":"weapon-dagger"}'::jsonb,
      'v1'
    );
  end if;

  if not exists (
    select 1 from public.current_bot_loadouts where character_id = 'opp-hp-bot'
  ) then
    perform public.save_bot_loadout(
      'opp-hp-bot',
      '{"chassis":"chassis-basic","paint":"paint-cobalt","weapon":"weapon-axe"}'::jsonb,
      'v1'
    );
  end if;
end $$;

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
