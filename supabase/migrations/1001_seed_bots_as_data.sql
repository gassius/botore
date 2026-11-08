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

-- Confirmed loadouts via the server validation function (service path).
-- Player: crimson + sword. Opponents: contrasting paints / weapons matching
-- existing combat-v1 seed builds.
do $$
begin
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
