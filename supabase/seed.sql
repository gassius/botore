-- Local / CI seed only (supabase db reset). NOT applied by hosted `db push`.
-- Former migrations 1000 / 1001 / 1002 (+ E2 NPC board density) — human test
-- logins use shared local-only-password. NPC ranking accounts use empty
-- encrypted_password (password sign-in impossible). Do not put production
-- credentials or usable NPC passwords here.

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

insert into public.profiles (account_id, display_name, botore_id, emblem_id)
values (
  '00000000-0000-4000-8000-000000000001',
  'Dev Player',
  'botore-dev-player',
  'emblem-default'
)
on conflict (account_id) do update
  set botore_id = coalesce(public.profiles.botore_id, excluded.botore_id),
      emblem_id = coalesce(nullif(public.profiles.emblem_id, ''), excluded.emblem_id);

-- D8 lanista NPC accounts for system fight opponents (A5 / A6 mockup names).
-- Local / CI seed only — never applied by hosted db push.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000001201', 'npc-magistra@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001202', 'npc-doctore@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001203', 'npc-tito@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb)
on conflict (id) do nothing;

insert into public.accounts (id, is_npc)
values
  ('00000000-0000-4000-8000-000000001201', true),
  ('00000000-0000-4000-8000-000000001202', true),
  ('00000000-0000-4000-8000-000000001203', true)
on conflict (id) do update
  set is_npc = excluded.is_npc;

insert into public.profiles (account_id, display_name, botore_id, emblem_id)
values
  ('00000000-0000-4000-8000-000000001201', 'Magistra Volta', 'npc-magistra-volta', 'emblem-coil'),
  ('00000000-0000-4000-8000-000000001202', 'Doctore Ferro', 'npc-doctore-ferro', 'emblem-anvil'),
  ('00000000-0000-4000-8000-000000001203', 'Tito Rivet', 'npc-tito-rivet', 'emblem-cog')
on conflict (account_id) do update
  set display_name = excluded.display_name,
      botore_id = coalesce(public.profiles.botore_id, excluded.botore_id),
      emblem_id = excluded.emblem_id;

-- Characters -----------------------------------------------------------------
-- System opponents keep stable ids + A5 roster names; account_id stays NULL
-- (opponents_unowned). Lanista Botore names link via opponent_lanistas (0033).
insert into public.characters (
    character_id, account_id, display_name, is_opponent, owner_is_npc
) values
  ('player-hero', '00000000-0000-4000-8000-000000000001', 'Hero', false, false),
  ('opp-dex-bot', null, 'Can Hook', true, false),
  ('opp-hp-bot',  null, 'Cobalt Brute', true, false),
  ('opp-sir-bot', null, 'Slab Mick', true, false)
on conflict (character_id) do update
  set account_id = excluded.account_id,
      display_name = excluded.display_name,
      is_opponent = excluded.is_opponent,
      owner_is_npc = excluded.owner_is_npc;

insert into public.opponent_lanistas (character_id, lanista_account_id)
values
  ('opp-dex-bot', '00000000-0000-4000-8000-000000001201'),
  ('opp-hp-bot',  '00000000-0000-4000-8000-000000001202'),
  ('opp-sir-bot', '00000000-0000-4000-8000-000000001203')
on conflict (character_id) do update
  set lanista_account_id = excluded.lanista_account_id;

-- Immutable build versions ----------------------------------------------------
insert into public.character_build_versions (character_id, hp, strength, agility, speed, weapon_kind, weapon_power)
select c.character_id, v.hp, v.strength, v.agility, v.speed, v.weapon_kind, v.weapon_power
from (values
  ('player-hero', 30, 5, 5, 6, 'sword', 3),
  -- combat-v1 weapon_kind check: sword|axe|dagger only (A6 mace/spear use proxies)
  ('opp-sir-bot', 34, 6, 4, 5, 'axe', 5),
  ('opp-dex-bot', 26, 4, 7, 8, 'sword', 3),
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
-- Idempotent. E7: 1 chassis, 10 paints, 7 weapons.
-- A5 roster rename (opp-sir-bot → Rivet Nan / Cobalt Brute etc.) is follow-up;
-- client ships apps/game/assets/a5fix/npcs.json for NPC metadata.

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
    'paint-crimson', 'paint', 'Oxide', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-crimson', true
  ),
  (
    'paint-cobalt', 'paint', 'Petrol', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-cobalt', true
  ),
  (
    'paint-primer', 'paint', 'Primer', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-primer', true
  ),
  (
    'paint-ink', 'paint', 'Ink', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-ink', true
  ),
  (
    'paint-drab', 'paint', 'Drab', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-drab', true
  ),
  (
    'paint-navy', 'paint', 'Cobalt', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-navy', true
  ),
  (
    'paint-frost', 'paint', 'Frost', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-frost', true
  ),
  (
    'paint-cinder', 'paint', 'Cinder', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-cinder', true
  ),
  (
    'paint-hazard', 'paint', 'Hazard', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-hazard', true
  ),
  (
    'paint-racing', 'paint', 'Racing', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-racing', true
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
  ),
  (
    'weapon-mace', 'weapon', 'Mace', 'axe', 5,
    '["weapon.mace"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-mace', true
  ),
  (
    'weapon-hammer', 'weapon', 'Hammer', 'axe', 5,
    '["weapon.hammer"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-hammer', true
  ),
  (
    'weapon-spear', 'weapon', 'Spear', 'sword', 3,
    '["weapon.spear"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-spear', true
  ),
  (
    'weapon-shield', 'weapon', 'Shield', 'dagger', 2,
    '["weapon.shield"]'::jsonb, '{"grip":"standard"}'::jsonb,
    'parts/weapon-shield', true
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
    ('paint-primer'),
    ('paint-ink'),
    ('paint-drab'),
    ('paint-navy'),
    ('paint-frost'),
    ('paint-cinder'),
    ('paint-hazard'),
    ('paint-racing'),
    ('weapon-sword'),
    ('weapon-axe'),
    ('weapon-dagger'),
    ('weapon-mace'),
    ('weapon-hammer'),
    ('weapon-spear'),
    ('weapon-shield'),
    ('head-visor'),
    ('head-welder'),
    ('head-can'),
    ('body-chassis'),
    ('body-boiler'),
    ('body-slab'),
    ('arms-stock'),
    ('arms-heavy'),
    ('legs-stock'),
    ('legs-piston')
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

  -- BT-171: first-run loadouts pin single Development atlas `v1` (draft OK
  -- for service_role during seed; Storage bootstrap publishes after reset).
  -- Former v2/v3 packs are retired.
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
      '{"chassis":"chassis-basic","paint":"paint-cinder","weapon":"weapon-mace"}'::jsonb,
      'v1'
    );
  end if;

  if not exists (
    select 1 from public.current_bot_loadouts where character_id = 'opp-dex-bot'
  ) then
    perform public.save_bot_loadout(
      'opp-dex-bot',
      '{"chassis":"chassis-basic","paint":"paint-primer","weapon":"weapon-spear"}'::jsonb,
      'v1'
    );
  end if;

  if not exists (
    select 1 from public.current_bot_loadouts where character_id = 'opp-hp-bot'
  ) then
    perform public.save_bot_loadout(
      'opp-hp-bot',
      '{"chassis":"chassis-basic","paint":"paint-navy","weapon":"weapon-mace"}'::jsonb,
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

insert into public.profiles (account_id, display_name, botore_id, emblem_id)
values
  ('00000000-0000-4000-8000-000000000011', 'Rank Peer A', 'botore-peer-bolt', 'emblem-default'),
  ('00000000-0000-4000-8000-000000000012', 'Rank Peer B', 'botore-peer-clank', 'emblem-default'),
  ('00000000-0000-4000-8000-000000000013', 'Rank Peer C', 'botore-peer-rivet', 'emblem-default')
on conflict (account_id) do update
  set botore_id = coalesce(public.profiles.botore_id, excluded.botore_id),
      emblem_id = coalesce(nullif(public.profiles.emblem_id, ''), excluded.emblem_id);

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

-- ---------------------------------------------------------------------------
-- E2: NPC ranking board density (~12 botores, 1–3 bots each)
-- Local / CI via [db.seed] only — NOT applied by hosted `db push`.
-- Hosted Development: after migrations, Infra runs seed.sql manually
-- (see docs/backend/verify.md). NPC auth.users have empty encrypted_password
-- so email/password sign-in cannot act as these accounts.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Proof catalogue (idempotent; same ids as seed.sql 1001)
-- ---------------------------------------------------------------------------
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
    'paint-crimson', 'paint', 'Oxide', null, null,
    '[]'::jsonb, '{}'::jsonb,
    'parts/paint-crimson', true
  ),
  (
    'paint-cobalt', 'paint', 'Petrol', null, null,
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

-- ---------------------------------------------------------------------------
-- 12 NPC auth users + accounts + profiles
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000001101', 'npc-steel@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001102', 'npc-rust@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001103', 'npc-coil@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001104', 'npc-spark@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001105', 'npc-gear@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001106', 'npc-anvil@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001107', 'npc-flux@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001108', 'npc-scrap@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001109', 'npc-volt@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001110', 'npc-oxide@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001111', 'npc-piston@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001112', 'npc-ember@botore.npc', '', now(), '{"provider":"email","providers":["email"]}'::jsonb)
on conflict (id) do nothing;

insert into public.accounts (id, is_npc)
values
  ('00000000-0000-4000-8000-000000001101', true),
  ('00000000-0000-4000-8000-000000001102', true),
  ('00000000-0000-4000-8000-000000001103', true),
  ('00000000-0000-4000-8000-000000001104', true),
  ('00000000-0000-4000-8000-000000001105', true),
  ('00000000-0000-4000-8000-000000001106', true),
  ('00000000-0000-4000-8000-000000001107', true),
  ('00000000-0000-4000-8000-000000001108', true),
  ('00000000-0000-4000-8000-000000001109', true),
  ('00000000-0000-4000-8000-000000001110', true),
  ('00000000-0000-4000-8000-000000001111', true),
  ('00000000-0000-4000-8000-000000001112', true)
on conflict (id) do update
  set is_npc = excluded.is_npc;

insert into public.profiles (account_id, display_name, botore_id, emblem_id)
values
  ('00000000-0000-4000-8000-000000001101', 'Steel Yard', 'npc-steel-yard', 'emblem-cog'),
  ('00000000-0000-4000-8000-000000001102', 'Rust Harbor', 'npc-rust-harbor', 'emblem-anchor'),
  ('00000000-0000-4000-8000-000000001103', 'Coil Works', 'npc-coil-works', 'emblem-coil'),
  ('00000000-0000-4000-8000-000000001104', 'Spark Pit', 'npc-spark-pit', 'emblem-bolt'),
  ('00000000-0000-4000-8000-000000001105', 'Gear Loft', 'npc-gear-loft', 'emblem-gear'),
  ('00000000-0000-4000-8000-000000001106', 'Anvil Row', 'npc-anvil-row', 'emblem-anvil'),
  ('00000000-0000-4000-8000-000000001107', 'Flux Bay', 'npc-flux-bay', 'emblem-wave'),
  ('00000000-0000-4000-8000-000000001108', 'Scrap Nest', 'npc-scrap-nest', 'emblem-scrap'),
  ('00000000-0000-4000-8000-000000001109', 'Volt Gate', 'npc-volt-gate', 'emblem-volt'),
  ('00000000-0000-4000-8000-000000001110', 'Oxide Bench', 'npc-oxide-bench', 'emblem-flame'),
  ('00000000-0000-4000-8000-000000001111', 'Piston Hall', 'npc-piston-hall', 'emblem-piston'),
  ('00000000-0000-4000-8000-000000001112', 'Ember Dock', 'npc-ember-dock', 'emblem-ember')
on conflict (account_id) do update
  set display_name = excluded.display_name,
      botore_id = coalesce(public.profiles.botore_id, excluded.botore_id),
      emblem_id = excluded.emblem_id;

-- ---------------------------------------------------------------------------
-- NPC bots (1–3 per botore) — owner_is_npc allows multi-bot accounts
-- ---------------------------------------------------------------------------
insert into public.characters (
    character_id, account_id, display_name, is_opponent, owner_is_npc
) values
  -- Steel Yard (3)
  ('npc-bot-rivet',   '00000000-0000-4000-8000-000000001101', 'Rivet',   false, true),
  ('npc-bot-brace',   '00000000-0000-4000-8000-000000001101', 'Brace',   false, true),
  ('npc-bot-girder',  '00000000-0000-4000-8000-000000001101', 'Girder',  false, true),
  -- Rust Harbor (2)
  ('npc-bot-keel',    '00000000-0000-4000-8000-000000001102', 'Keel',    false, true),
  ('npc-bot-barnacle','00000000-0000-4000-8000-000000001102', 'Barnacle',false, true),
  -- Coil Works (2)
  ('npc-bot-helix',   '00000000-0000-4000-8000-000000001103', 'Helix',   false, true),
  ('npc-bot-spool',   '00000000-0000-4000-8000-000000001103', 'Spool',   false, true),
  -- Spark Pit (1)
  ('npc-bot-arc',     '00000000-0000-4000-8000-000000001104', 'Arc',     false, true),
  -- Gear Loft (3)
  ('npc-bot-cog',     '00000000-0000-4000-8000-000000001105', 'Cog',     false, true),
  ('npc-bot-sprocket','00000000-0000-4000-8000-000000001105', 'Sprocket',false, true),
  ('npc-bot-ratchet', '00000000-0000-4000-8000-000000001105', 'Ratchet', false, true),
  -- Anvil Row (2)
  ('npc-bot-forge',   '00000000-0000-4000-8000-000000001106', 'Forge',   false, true),
  ('npc-bot-hammer',  '00000000-0000-4000-8000-000000001106', 'Hammer',  false, true),
  -- Flux Bay (1)
  ('npc-bot-current', '00000000-0000-4000-8000-000000001107', 'Current', false, true),
  -- Scrap Nest (3)
  ('npc-bot-junk',    '00000000-0000-4000-8000-000000001108', 'Junk',    false, true),
  ('npc-bot-shard',   '00000000-0000-4000-8000-000000001108', 'Shard',   false, true),
  ('npc-bot-tangle',  '00000000-0000-4000-8000-000000001108', 'Tangle',  false, true),
  -- Volt Gate (2)
  ('npc-bot-surge',   '00000000-0000-4000-8000-000000001109', 'Surge',   false, true),
  ('npc-bot-zap',     '00000000-0000-4000-8000-000000001109', 'Zap',     false, true),
  -- Oxide Bench (1)
  ('npc-bot-patina',  '00000000-0000-4000-8000-000000001110', 'Patina',  false, true),
  -- Piston Hall (2)
  ('npc-bot-stroke',  '00000000-0000-4000-8000-000000001111', 'Stroke',  false, true),
  ('npc-bot-cam',     '00000000-0000-4000-8000-000000001111', 'Cam',     false, true),
  -- Ember Dock (2)
  ('npc-bot-cinder',  '00000000-0000-4000-8000-000000001112', 'Cinder',  false, true),
  ('npc-bot-flare',   '00000000-0000-4000-8000-000000001112', 'Flare',   false, true)
on conflict (character_id) do update
  set owner_is_npc = true,
      display_name = excluded.display_name,
      account_id = excluded.account_id,
      is_opponent = false;

-- Builds (idempotent: insert when character has none)
insert into public.character_build_versions (
    character_id, hp, strength, agility, speed, weapon_kind, weapon_power
)
select v.character_id, v.hp, v.strength, v.agility, v.speed, v.weapon_kind, v.weapon_power
  from (values
    ('npc-bot-rivet',    32, 6, 4, 5, 'sword',  3),
    ('npc-bot-brace',    36, 7, 3, 4, 'axe',    5),
    ('npc-bot-girder',   28, 5, 6, 7, 'dagger', 2),
    ('npc-bot-keel',     34, 6, 5, 5, 'sword',  3),
    ('npc-bot-barnacle', 30, 4, 7, 6, 'dagger', 2),
    ('npc-bot-helix',    29, 5, 6, 8, 'dagger', 2),
    ('npc-bot-spool',    33, 6, 4, 5, 'axe',    5),
    ('npc-bot-arc',      31, 7, 5, 6, 'sword',  3),
    ('npc-bot-cog',      35, 6, 4, 4, 'axe',    5),
    ('npc-bot-sprocket', 27, 4, 8, 7, 'dagger', 2),
    ('npc-bot-ratchet',  32, 5, 5, 6, 'sword',  3),
    ('npc-bot-forge',    38, 8, 3, 3, 'axe',    5),
    ('npc-bot-hammer',   36, 7, 4, 4, 'axe',    5),
    ('npc-bot-current',  28, 5, 7, 8, 'dagger', 2),
    ('npc-bot-junk',     30, 5, 5, 5, 'sword',  3),
    ('npc-bot-shard',    26, 4, 8, 8, 'dagger', 2),
    ('npc-bot-tangle',   33, 6, 4, 5, 'axe',    5),
    ('npc-bot-surge',    31, 6, 6, 6, 'sword',  3),
    ('npc-bot-zap',      29, 5, 7, 7, 'dagger', 2),
    ('npc-bot-patina',   34, 6, 5, 5, 'sword',  3),
    ('npc-bot-stroke',   35, 7, 4, 5, 'axe',    5),
    ('npc-bot-cam',      30, 5, 6, 6, 'sword',  3),
    ('npc-bot-cinder',   32, 6, 5, 5, 'axe',    5),
    ('npc-bot-flare',    28, 5, 7, 7, 'dagger', 2)
  ) as v(character_id, hp, strength, agility, speed, weapon_kind, weapon_power)
 where exists (
     select 1 from public.characters c where c.character_id = v.character_id
 )
   and not exists (
     select 1 from public.character_build_versions b where b.character_id = v.character_id
   );

-- Inventory grants for NPC accounts (proof kit)
insert into public.inventory_ledger (account_id, part_id, delta, reason)
select a.id, p.part_id, 1, 'seed'
  from public.accounts a
  cross join (
    values
      ('chassis-basic'),
      ('paint-crimson'),
      ('paint-cobalt'),
      ('weapon-sword'),
      ('weapon-axe'),
      ('weapon-dagger')
  ) as p(part_id)
 where a.is_npc
   and a.id::text like '00000000-0000-4000-8000-0000000011%'
   and not exists (
     select 1
       from public.inventory_ledger il
      where il.account_id = a.id
        and il.part_id = p.part_id
        and il.reason = 'seed'
        and il.delta > 0
   );

-- Confirmed loadouts — paint/weapon + A4 shapes (0041 ranking portraits)
insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
select v.character_id,
       jsonb_build_object(
         'chassis', 'chassis-basic',
         'paint', v.paint,
         'weapon', v.weapon,
         'head', v.head,
         'body', v.body,
         'arms', v.arms,
         'legs', v.legs,
         'decals', '[]'::jsonb,
         'soundTags', v.sound_tags
       )
       || jsonb_build_object('shield', 'null'::jsonb)
       || jsonb_build_object('drone', 'null'::jsonb),
       'v1'
  from (values
    ('npc-bot-rivet',    'paint-crimson', 'weapon-sword',  'head-welder', 'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-brace',    'paint-cobalt',  'weapon-axe',    'head-can',    'body-boiler',  'arms-heavy', 'legs-piston', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-girder',   'paint-crimson', 'weapon-dagger', 'head-visor',  'body-slab',    'arms-stock', 'legs-stock', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-keel',     'paint-cobalt',  'weapon-sword',  'head-welder', 'body-chassis', 'arms-heavy', 'legs-stock', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-barnacle', 'paint-crimson', 'weapon-dagger', 'head-can',    'body-chassis', 'arms-stock', 'legs-piston', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-helix',    'paint-cobalt',  'weapon-dagger', 'head-visor',  'body-boiler',  'arms-stock', 'legs-stock', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-spool',    'paint-crimson', 'weapon-axe',    'head-welder', 'body-slab',    'arms-heavy', 'legs-piston', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-arc',      'paint-cobalt',  'weapon-sword',  'head-visor',  'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-cog',      'paint-crimson', 'weapon-axe',    'head-can',    'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-sprocket', 'paint-cobalt',  'weapon-dagger', 'head-welder', 'body-boiler',  'arms-heavy', 'legs-stock', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-ratchet',  'paint-crimson', 'weapon-sword',  'head-visor',  'body-chassis', 'arms-stock', 'legs-piston', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-forge',    'paint-cobalt',  'weapon-axe',    'head-can',    'body-slab',    'arms-heavy', 'legs-piston', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-hammer',   'paint-crimson', 'weapon-axe',    'head-welder', 'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-current',  'paint-cobalt',  'weapon-dagger', 'head-visor',  'body-boiler',  'arms-stock', 'legs-stock', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-junk',     'paint-crimson', 'weapon-sword',  'head-can',    'body-chassis', 'arms-heavy', 'legs-stock', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-shard',    'paint-cobalt',  'weapon-dagger', 'head-welder', 'body-chassis', 'arms-stock', 'legs-piston', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-tangle',   'paint-crimson', 'weapon-axe',    'head-visor',  'body-slab',    'arms-stock', 'legs-stock', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-surge',    'paint-cobalt',  'weapon-sword',  'head-can',    'body-boiler',  'arms-heavy', 'legs-piston', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-zap',      'paint-crimson', 'weapon-dagger', 'head-welder', 'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-patina',   'paint-cobalt',  'weapon-sword',  'head-visor',  'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-stroke',   'paint-crimson', 'weapon-axe',    'head-can',    'body-chassis', 'arms-heavy', 'legs-stock', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-cam',      'paint-cobalt',  'weapon-sword',  'head-welder', 'body-boiler',  'arms-stock', 'legs-piston', '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-cinder',   'paint-crimson', 'weapon-axe',    'head-visor',  'body-slab',    'arms-heavy', 'legs-piston', '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-flare',    'paint-cobalt',  'weapon-dagger', 'head-can',    'body-chassis', 'arms-stock', 'legs-stock', '["chassis.light","weapon.dagger"]'::jsonb)
  ) as v(character_id, paint, weapon, head, body, arms, legs, sound_tags)
 where exists (select 1 from public.characters c where c.character_id = v.character_id)
   and not exists (
     select 1 from public.bot_loadout_versions l where l.character_id = v.character_id
   );

-- ---------------------------------------------------------------------------
-- Synthetic confirmed fights → plausible W-L (deterministic battle ids)
-- ---------------------------------------------------------------------------
do $$
declare
  v_seeded boolean;
begin
  select exists (
    select 1 from public.battles where battle_id = 'a0000000-0000-4000-8000-000000000001'
  ) into v_seeded;

  if v_seeded then
    return;
  end if;

  -- Helper inline: insert one defeat battle between two NPC bots.
  -- Records (attacker wins unless noted): chosen for spread + tie-break cases.
  insert into public.battles (
      battle_id, rules_version, seed, started_at, ended_at,
      initiator_account_id, initiator_account_character,
      winner_id, end_reason, utc_day
  ) values
    -- Rivet 5-1, Brace 3-2, Girder 2-3 (Steel Yard strong)
    ('a0000000-0000-4000-8000-000000000001', 'combat-v1', 'npc-seed-1',  now() - interval '20 days', now() - interval '20 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-rivet',  'npc-bot-rivet',  'defeat', (now() at time zone 'utc')::date - 20),
    ('a0000000-0000-4000-8000-000000000002', 'combat-v1', 'npc-seed-2',  now() - interval '19 days', now() - interval '19 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-rivet',  'npc-bot-rivet',  'defeat', (now() at time zone 'utc')::date - 19),
    ('a0000000-0000-4000-8000-000000000003', 'combat-v1', 'npc-seed-3',  now() - interval '18 days', now() - interval '18 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-rivet',  'npc-bot-rivet',  'defeat', (now() at time zone 'utc')::date - 18),
    ('a0000000-0000-4000-8000-000000000004', 'combat-v1', 'npc-seed-4',  now() - interval '17 days', now() - interval '17 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-rivet',  'npc-bot-rivet',  'defeat', (now() at time zone 'utc')::date - 17),
    ('a0000000-0000-4000-8000-000000000005', 'combat-v1', 'npc-seed-5',  now() - interval '16 days', now() - interval '16 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-rivet',  'npc-bot-rivet',  'defeat', (now() at time zone 'utc')::date - 16),
    ('a0000000-0000-4000-8000-000000000006', 'combat-v1', 'npc-seed-6',  now() - interval '15 days', now() - interval '15 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-brace',  'npc-bot-brace',  'defeat', (now() at time zone 'utc')::date - 15),
    ('a0000000-0000-4000-8000-000000000007', 'combat-v1', 'npc-seed-7',  now() - interval '14 days', now() - interval '14 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-brace',  'npc-bot-brace',  'defeat', (now() at time zone 'utc')::date - 14),
    ('a0000000-0000-4000-8000-000000000008', 'combat-v1', 'npc-seed-8',  now() - interval '13 days', now() - interval '13 days', '00000000-0000-4000-8000-000000001101', 'npc-bot-brace',  'npc-bot-brace',  'defeat', (now() at time zone 'utc')::date - 13),
    ('a0000000-0000-4000-8000-000000000009', 'combat-v1', 'npc-seed-9',  now() - interval '12 days', now() - interval '12 days', '00000000-0000-4000-8000-000000001105', 'npc-bot-cog',    'npc-bot-cog',    'defeat', (now() at time zone 'utc')::date - 12),
    ('a0000000-0000-4000-8000-00000000000a', 'combat-v1', 'npc-seed-10', now() - interval '11 days', now() - interval '11 days', '00000000-0000-4000-8000-000000001105', 'npc-bot-cog',    'npc-bot-cog',    'defeat', (now() at time zone 'utc')::date - 11),
    ('a0000000-0000-4000-8000-00000000000b', 'combat-v1', 'npc-seed-11', now() - interval '10 days', now() - interval '10 days', '00000000-0000-4000-8000-000000001106', 'npc-bot-forge',  'npc-bot-forge',  'defeat', (now() at time zone 'utc')::date - 10),
    ('a0000000-0000-4000-8000-00000000000c', 'combat-v1', 'npc-seed-12', now() - interval '9 days',  now() - interval '9 days',  '00000000-0000-4000-8000-000000001106', 'npc-bot-forge',  'npc-bot-forge',  'defeat', (now() at time zone 'utc')::date - 9),
    ('a0000000-0000-4000-8000-00000000000d', 'combat-v1', 'npc-seed-13', now() - interval '8 days',  now() - interval '8 days',  '00000000-0000-4000-8000-000000001106', 'npc-bot-forge',  'npc-bot-forge',  'defeat', (now() at time zone 'utc')::date - 8),
    ('a0000000-0000-4000-8000-00000000000e', 'combat-v1', 'npc-seed-14', now() - interval '7 days',  now() - interval '7 days',  '00000000-0000-4000-8000-000000001109', 'npc-bot-surge',  'npc-bot-surge',  'defeat', (now() at time zone 'utc')::date - 7),
    ('a0000000-0000-4000-8000-00000000000f', 'combat-v1', 'npc-seed-15', now() - interval '6 days',  now() - interval '6 days',  '00000000-0000-4000-8000-000000001109', 'npc-bot-surge',  'npc-bot-surge',  'defeat', (now() at time zone 'utc')::date - 6),
    -- Tie-break pair: same wins (2), different XP later — Arc vs Patina both 2-2
    ('a0000000-0000-4000-8000-000000000010', 'combat-v1', 'npc-seed-16', now() - interval '5 days',  now() - interval '5 days',  '00000000-0000-4000-8000-000000001104', 'npc-bot-arc',    'npc-bot-arc',    'defeat', (now() at time zone 'utc')::date - 5),
    ('a0000000-0000-4000-8000-000000000011', 'combat-v1', 'npc-seed-17', now() - interval '4 days',  now() - interval '4 days',  '00000000-0000-4000-8000-000000001104', 'npc-bot-arc',    'npc-bot-arc',    'defeat', (now() at time zone 'utc')::date - 4),
    ('a0000000-0000-4000-8000-000000000012', 'combat-v1', 'npc-seed-18', now() - interval '3 days',  now() - interval '3 days',  '00000000-0000-4000-8000-000000001110', 'npc-bot-patina', 'npc-bot-patina', 'defeat', (now() at time zone 'utc')::date - 3),
    ('a0000000-0000-4000-8000-000000000013', 'combat-v1', 'npc-seed-19', now() - interval '2 days',  now() - interval '2 days',  '00000000-0000-4000-8000-000000001110', 'npc-bot-patina', 'npc-bot-patina', 'defeat', (now() at time zone 'utc')::date - 2),
    -- Losses for the winners above (defenders who lost)
    ('a0000000-0000-4000-8000-000000000014', 'combat-v1', 'npc-seed-20', now() - interval '1 days',  now() - interval '1 days',  '00000000-0000-4000-8000-000000001108', 'npc-bot-junk',   'npc-bot-shard',  'defeat', (now() at time zone 'utc')::date - 1);

  insert into public.battle_participants (
      battle_id, character_id, side, hp_before, hp_after, weapon_kind, weapon_power
  ) values
    ('a0000000-0000-4000-8000-000000000001', 'npc-bot-rivet',  'attacker', 32, 20, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000001', 'npc-bot-keel',   'defender', 34, 0,  'sword', 3),
    ('a0000000-0000-4000-8000-000000000002', 'npc-bot-rivet',  'attacker', 32, 18, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000002', 'npc-bot-helix',  'defender', 29, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-000000000003', 'npc-bot-rivet',  'attacker', 32, 22, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000003', 'npc-bot-junk',   'defender', 30, 0,  'sword', 3),
    ('a0000000-0000-4000-8000-000000000004', 'npc-bot-rivet',  'attacker', 32, 15, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000004', 'npc-bot-current','defender', 28, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-000000000005', 'npc-bot-rivet',  'attacker', 32, 19, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000005', 'npc-bot-zap',    'defender', 29, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-000000000006', 'npc-bot-brace',  'attacker', 36, 24, 'axe', 5),
    ('a0000000-0000-4000-8000-000000000006', 'npc-bot-barnacle','defender',30, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-000000000007', 'npc-bot-brace',  'attacker', 36, 21, 'axe', 5),
    ('a0000000-0000-4000-8000-000000000007', 'npc-bot-spool',  'defender', 33, 0,  'axe', 5),
    ('a0000000-0000-4000-8000-000000000008', 'npc-bot-brace',  'attacker', 36, 18, 'axe', 5),
    ('a0000000-0000-4000-8000-000000000008', 'npc-bot-tangle', 'defender', 33, 0,  'axe', 5),
    ('a0000000-0000-4000-8000-000000000009', 'npc-bot-cog',    'attacker', 35, 22, 'axe', 5),
    ('a0000000-0000-4000-8000-000000000009', 'npc-bot-girder', 'defender', 28, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-00000000000a', 'npc-bot-cog',    'attacker', 35, 20, 'axe', 5),
    ('a0000000-0000-4000-8000-00000000000a', 'npc-bot-flare',  'defender', 28, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-00000000000b', 'npc-bot-forge',  'attacker', 38, 25, 'axe', 5),
    ('a0000000-0000-4000-8000-00000000000b', 'npc-bot-sprocket','defender',27, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-00000000000c', 'npc-bot-forge',  'attacker', 38, 28, 'axe', 5),
    ('a0000000-0000-4000-8000-00000000000c', 'npc-bot-shard',  'defender', 26, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-00000000000d', 'npc-bot-forge',  'attacker', 38, 26, 'axe', 5),
    ('a0000000-0000-4000-8000-00000000000d', 'npc-bot-cam',    'defender', 30, 0,  'sword', 3),
    ('a0000000-0000-4000-8000-00000000000e', 'npc-bot-surge',  'attacker', 31, 17, 'sword', 3),
    ('a0000000-0000-4000-8000-00000000000e', 'npc-bot-ratchet','defender', 32, 0,  'sword', 3),
    ('a0000000-0000-4000-8000-00000000000f', 'npc-bot-surge',  'attacker', 31, 16, 'sword', 3),
    ('a0000000-0000-4000-8000-00000000000f', 'npc-bot-cinder', 'defender', 32, 0,  'axe', 5),
    ('a0000000-0000-4000-8000-000000000010', 'npc-bot-arc',    'attacker', 31, 14, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000010', 'npc-bot-hammer', 'defender', 36, 0,  'axe', 5),
    ('a0000000-0000-4000-8000-000000000011', 'npc-bot-arc',    'attacker', 31, 12, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000011', 'npc-bot-stroke', 'defender', 35, 0,  'axe', 5),
    ('a0000000-0000-4000-8000-000000000012', 'npc-bot-patina', 'attacker', 34, 19, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000012', 'npc-bot-girder', 'defender', 28, 0,  'dagger', 2),
    ('a0000000-0000-4000-8000-000000000013', 'npc-bot-patina', 'attacker', 34, 21, 'sword', 3),
    ('a0000000-0000-4000-8000-000000000013', 'npc-bot-junk',   'defender', 30, 0,  'sword', 3),
    ('a0000000-0000-4000-8000-000000000014', 'npc-bot-junk',   'attacker', 30, 0,  'sword', 3),
    ('a0000000-0000-4000-8000-000000000014', 'npc-bot-shard',  'defender', 26, 8,  'dagger', 2);

  -- XP: win=2 / loss=1 for each participation with a decided winner.
  -- Idempotent pack: only when rivet has no ledger rows.
  if not exists (
    select 1 from public.progression_ledger where character_id = 'npc-bot-rivet'
  ) then
    insert into public.progression_ledger (account_id, character_id, battle_id, delta_xp, reason)
    select
        c.account_id,
        bp.character_id,
        bp.battle_id,
        case when b.winner_id = bp.character_id then 2 else 1 end,
        'battle'
      from public.battle_participants bp
      join public.battles b on b.battle_id = bp.battle_id
      join public.characters c on c.character_id = bp.character_id
     where b.battle_id >= 'a0000000-0000-4000-8000-000000000001'
       and b.battle_id <= 'a0000000-0000-4000-8000-000000000014'
       and b.winner_id is not null
       and c.account_id is not null;
  end if;

  -- Extra XP on Arc (not Patina) so same W-L (2-2) ties break by totalXp desc.
  if not exists (
    select 1
      from public.progression_ledger
     where character_id = 'npc-bot-arc'
       and battle_id is null
       and delta_xp = 2
  ) then
    insert into public.progression_ledger (account_id, character_id, battle_id, delta_xp, reason)
    values
      ('00000000-0000-4000-8000-000000001104', 'npc-bot-arc', null, 2, 'battle'),
      ('00000000-0000-4000-8000-000000001104', 'npc-bot-arc', null, 2, 'battle');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- System opponent W–L for D8 cards (A6 mockup: Can Hook 19–2, Cobalt Brute
-- 15–5, Slab Mick 13–6). Local / CI seed only. Sacrificial defenders rotate
-- among ranking NPC bots so bot_fight_records derives real counts.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seeded boolean;
  v_i int;
  v_battle uuid;
  v_opp text;
  v_account uuid;
  v_wins int;
  v_losses int;
  v_defenders text[] := array[
    'npc-bot-keel', 'npc-bot-helix', 'npc-bot-junk', 'npc-bot-current',
    'npc-bot-zap', 'npc-bot-barnacle', 'npc-bot-spool', 'npc-bot-tangle',
    'npc-bot-girder', 'npc-bot-flare', 'npc-bot-sprocket', 'npc-bot-shard'
  ];
  v_rec record;
begin
  select exists (
    select 1 from public.battles where battle_id = 'b0000000-0000-4000-8000-000000000001'
  ) into v_seeded;
  if v_seeded then
    return;
  end if;

  for v_rec in
    select * from (values
      ('opp-dex-bot', '00000000-0000-4000-8000-000000001201'::uuid, 19, 2, 0),
      ('opp-hp-bot',  '00000000-0000-4000-8000-000000001202'::uuid, 15, 5, 100),
      ('opp-sir-bot', '00000000-0000-4000-8000-000000001203'::uuid, 13, 6, 200)
    ) as t(opp, account_id, wins, losses, id_base)
  loop
    v_opp := v_rec.opp;
    v_account := v_rec.account_id;
    v_wins := v_rec.wins;
    v_losses := v_rec.losses;

    for v_i in 1..v_wins loop
      v_battle := (
        'b0000000-0000-4000-8000-' || lpad((v_rec.id_base + v_i)::text, 12, '0')
      )::uuid;
      insert into public.battles (
          battle_id, rules_version, seed, started_at, ended_at,
          initiator_account_id, initiator_account_character,
          winner_id, end_reason, utc_day
      ) values (
          v_battle, 'combat-v1', 'sys-opp-win-' || v_opp || '-' || v_i,
          now() - ((v_rec.id_base + v_i) || ' hours')::interval,
          now() - ((v_rec.id_base + v_i) || ' hours')::interval,
          v_account, v_opp, v_opp, 'defeat',
          (now() at time zone 'utc')::date
      );
      insert into public.battle_participants (
          battle_id, character_id, side, hp_before, hp_after, weapon_kind, weapon_power
      ) values
        (v_battle, v_opp, 'attacker', 34, 20, 'sword', 3),
        (v_battle, v_defenders[((v_i - 1) % array_length(v_defenders, 1)) + 1],
         'defender', 30, 0, 'sword', 3);
    end loop;

    for v_i in 1..v_losses loop
      v_battle := (
        'b0000000-0000-4000-8000-' || lpad((v_rec.id_base + 50 + v_i)::text, 12, '0')
      )::uuid;
      insert into public.battles (
          battle_id, rules_version, seed, started_at, ended_at,
          initiator_account_id, initiator_account_character,
          winner_id, end_reason, utc_day
      ) values (
          v_battle, 'combat-v1', 'sys-opp-loss-' || v_opp || '-' || v_i,
          now() - ((v_rec.id_base + 50 + v_i) || ' hours')::interval,
          now() - ((v_rec.id_base + 50 + v_i) || ' hours')::interval,
          v_account, v_opp,
          v_defenders[((v_i - 1) % array_length(v_defenders, 1)) + 1],
          'defeat',
          (now() at time zone 'utc')::date
      );
      insert into public.battle_participants (
          battle_id, character_id, side, hp_before, hp_after, weapon_kind, weapon_power
      ) values
        (v_battle, v_opp, 'attacker', 34, 0, 'sword', 3),
        (v_battle, v_defenders[((v_i - 1) % array_length(v_defenders, 1)) + 1],
         'defender', 30, 18, 'sword', 3);
    end loop;
  end loop;
end $$;

-- D11: keep player-facing paint names aligned even when earlier inserts used
-- ON CONFLICT DO NOTHING against an older catalogue row.
update public.parts_catalogue set display_name = 'Cobalt' where part_id = 'paint-navy';
update public.parts_catalogue set display_name = 'Petrol' where part_id = 'paint-cobalt';
update public.parts_catalogue set display_name = 'Oxide' where part_id = 'paint-crimson';
