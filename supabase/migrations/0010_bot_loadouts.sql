-- 0010: immutable bot loadout versions + current view
--
-- A confirmed loadout is an append-only version row. Preview state is client-
-- local until save_bot_loadout succeeds. Historical fights reference a
-- loadout_version_id so later catalogue changes cannot rewrite appearance.

create table public.bot_loadout_versions (
    loadout_version_id uuid primary key default gen_random_uuid(),
    character_id text not null references public.characters (character_id) on delete cascade,
    -- jsonb shape (validated by save_bot_loadout):
    -- {
    --   "chassis": "<part_id>",
    --   "paint": "<part_id>",
    --   "weapon": "<part_id>",
    --   "shield": null | "<part_id>",
    --   "drone": null | "<part_id>",
    --   "decals": ["<part_id>", ...],
    --   "soundTags": ["chassis.light", "weapon.sword", ...]
    -- }
    loadout jsonb not null
        check (jsonb_typeof(loadout) = 'object'),
    -- Immutable media pack version this loadout was confirmed against.
    atlas_version text not null
        check (atlas_version ~ '^v[0-9]+$'),
    created_at timestamptz not null default now()
);

create index bot_loadout_versions_character_created_idx
    on public.bot_loadout_versions (character_id, created_at desc);

create view public.current_bot_loadouts
with (security_invoker = true) as
select distinct on (character_id)
    loadout_version_id,
    character_id,
    loadout,
    atlas_version,
    created_at
from public.bot_loadout_versions
order by character_id, created_at desc;

grant select on public.current_bot_loadouts to authenticated, anon;

-- Fight wiring: participants may pin an immutable loadout version.
-- Nullable so existing battles remain valid; F2/F3 populate this.
alter table public.battle_participants
    add column loadout_version_id uuid
        references public.bot_loadout_versions (loadout_version_id);

comment on table public.bot_loadout_versions is
  'Immutable confirmed bot loadouts. Fights reference loadout_version_id.';
