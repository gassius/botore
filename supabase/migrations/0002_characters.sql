-- 0002: characters + immutable build versions
create table public.characters (
    character_id text primary key,
    account_id uuid references public.accounts (id) on delete cascade,
    display_name text not null check (char_length(display_name) between 1 and 48),
    is_opponent boolean not null default false,
    created_at timestamptz not null default now(),
    -- opponents are system-owned (account_id null); players own exactly one character in the slice
    constraint opponents_unowned check (is_opponent = false or account_id is null),
    constraint players_owned check (is_opponent = true or account_id is not null)
);

create unique index one_character_per_player
    on public.characters (account_id)
    where account_id is not null;

create table public.character_build_versions (
    build_version_id uuid primary key default gen_random_uuid(),
    character_id text not null references public.characters (character_id) on delete cascade,
    hp integer not null check (hp between 1 and 999),
    strength integer not null check (strength between 0 and 99),
    agility integer not null check (agility between 0 and 99),
    speed integer not null check (speed between 0 and 99),
    weapon_kind text not null check (weapon_kind in ('sword', 'axe', 'dagger')),
    weapon_power integer not null check (weapon_power between 0 and 99),
    created_at timestamptz not null default now()
);

-- latest build per character helper view (immutable history preserved)
create view public.current_character_builds as
select distinct on (character_id)
    character_id, hp, strength, agility, speed, weapon_kind, weapon_power
from public.character_build_versions
order by character_id, created_at desc;
