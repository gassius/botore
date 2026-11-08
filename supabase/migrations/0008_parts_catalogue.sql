-- 0008: shared parts catalogue (bots-as-data)
--
-- Chassis / paint / weapon are the proof slots. Shield / drone / decal are
-- reserved extension slots in the schema only — no combat-v1 mechanics.
-- Clients never write this table; service role / migrations / seeds do.

create table public.parts_catalogue (
    part_id text primary key
        check (char_length(part_id) between 1 and 64),
    slot_kind text not null
        check (slot_kind in ('chassis', 'paint', 'weapon', 'shield', 'drone', 'decal')),
    display_name text not null
        check (char_length(display_name) between 1 and 48),
    -- Optional combat-v1 weapon fields (null for non-weapon slots).
    weapon_kind text
        check (
            weapon_kind is null
            or weapon_kind in ('sword', 'axe', 'dagger')
        ),
    weapon_power integer
        check (weapon_power is null or weapon_power between 0 and 99),
    -- Sound tags carried by the part (empty for paint/decals).
    sound_tags jsonb not null default '[]'::jsonb
        check (jsonb_typeof(sound_tags) = 'array'),
    -- Compatibility metadata (e.g. grip family). Empty object = unrestricted.
    compatibility jsonb not null default '{}'::jsonb
        check (jsonb_typeof(compatibility) = 'object'),
    -- Placeholder media key under atlas/<version>/parts/<part_id>/.
    media_key text not null
        check (char_length(media_key) between 1 and 256),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    constraint weapon_fields_match_slot check (
        (slot_kind = 'weapon' and weapon_kind is not null and weapon_power is not null)
        or (slot_kind <> 'weapon' and weapon_kind is null and weapon_power is null)
    )
);

create index parts_catalogue_slot_kind_idx
    on public.parts_catalogue (slot_kind)
    where is_active;

comment on table public.parts_catalogue is
  'Shared modular parts catalogue. Client-readable when active; never client-writable.';
