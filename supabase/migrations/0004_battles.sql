-- 0004: battles, participants, idempotency, replays
create table public.battles (
    battle_id uuid primary key,
    rules_version text not null,
    seed text not null,
    started_at timestamptz not null default now(),
    ended_at timestamptz not null default now(),
    initiator_account_id uuid references public.accounts (id),
    initiator_account_character text references public.characters (character_id),
    winner_id text references public.characters (character_id),
    end_reason text not null check (end_reason in ('defeat', 'action_limit_tiebreak')),
    utc_day date not null default (now() at time zone 'utc')::date
);

create table public.battle_participants (
    battle_id uuid not null references public.battles (battle_id) on delete cascade,
    character_id text not null references public.characters (character_id),
    side text not null check (side in ('attacker', 'defender')),
    hp_before integer not null check (hp_before >= 0),
    hp_after integer not null check (hp_after >= 0),
    weapon_kind text not null,
    weapon_power integer not null,
    primary key (battle_id, character_id)
);

-- Idempotency: one command per (account, key). Guards double consumption
-- and double XP awards at the constraint level.
create table public.battle_commands (
    account_id uuid not null references public.accounts (id),
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
    battle_id uuid not null references public.battles (battle_id),
    created_at timestamptz not null default now(),
    primary key (account_id, idempotency_key)
);

create table public.battle_replays (
    battle_id uuid primary key references public.battles (battle_id) on delete cascade,
    replay_version integer not null,
    payload jsonb not null,
    input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
    checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now()
);
