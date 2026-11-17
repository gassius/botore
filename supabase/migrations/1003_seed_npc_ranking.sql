-- 1003: E2 idempotent NPC ranking seed (~12 botores, 1–3 bots each)
--
-- ClickUp: E2 Ranking backend (1amjtrezaj2)
--
-- Applied by normal migrations (including hosted db push) so ranking has
-- board density without relying on local-only seed.sql. Safe to re-run:
-- ON CONFLICT / existence guards throughout.
--
-- Each NPC botore is flagged accounts.is_npc. Bots are visibly different via
-- paint/weapon (proof catalogue only — no catalogue expansion). Plausible
-- W-L comes from synthetic confirmed battles (winner_id set). XP ledger rows
-- match win=2 / loss=1 awards so C5 list_ranking stays coherent.

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

-- ---------------------------------------------------------------------------
-- 12 NPC auth users + accounts + profiles
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
values
  ('00000000-0000-4000-8000-000000001101', 'npc-steel@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001102', 'npc-rust@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001103', 'npc-coil@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001104', 'npc-spark@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001105', 'npc-gear@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001106', 'npc-anvil@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001107', 'npc-flux@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001108', 'npc-scrap@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001109', 'npc-volt@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001110', 'npc-oxide@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001111', 'npc-piston@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb),
  ('00000000-0000-4000-8000-000000001112', 'npc-ember@botore.npc', crypt('npc-seed-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb)
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

-- Confirmed loadouts — visibly different paint/weapon pairs
insert into public.bot_loadout_versions (character_id, loadout, atlas_version)
select v.character_id,
       jsonb_build_object(
         'chassis', 'chassis-basic',
         'paint', v.paint,
         'weapon', v.weapon,
         'decals', '[]'::jsonb,
         'soundTags', v.sound_tags
       )
       || jsonb_build_object('shield', 'null'::jsonb)
       || jsonb_build_object('drone', 'null'::jsonb),
       'v1'
  from (values
    ('npc-bot-rivet',    'paint-crimson', 'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-brace',    'paint-cobalt',  'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-girder',   'paint-crimson', 'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-keel',     'paint-cobalt',  'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-barnacle', 'paint-crimson', 'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-helix',    'paint-cobalt',  'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-spool',    'paint-crimson', 'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-arc',      'paint-cobalt',  'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-cog',      'paint-crimson', 'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-sprocket', 'paint-cobalt',  'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-ratchet',  'paint-crimson', 'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-forge',    'paint-cobalt',  'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-hammer',   'paint-crimson', 'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-current',  'paint-cobalt',  'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-junk',     'paint-crimson', 'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-shard',    'paint-cobalt',  'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-tangle',   'paint-crimson', 'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-surge',    'paint-cobalt',  'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-zap',      'paint-crimson', 'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb),
    ('npc-bot-patina',   'paint-cobalt',  'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-stroke',   'paint-crimson', 'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-cam',      'paint-cobalt',  'weapon-sword',  '["chassis.light","weapon.sword"]'::jsonb),
    ('npc-bot-cinder',   'paint-crimson', 'weapon-axe',    '["chassis.light","weapon.axe"]'::jsonb),
    ('npc-bot-flare',    'paint-cobalt',  'weapon-dagger', '["chassis.light","weapon.dagger"]'::jsonb)
  ) as v(character_id, paint, weapon, sound_tags)
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
