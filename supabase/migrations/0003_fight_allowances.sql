-- 0003: fight allowances — three slots per account per UTC day
create table public.fight_allowances (
    fight_allowance_id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id) on delete cascade,
    utc_day date not null,
    slot_index integer not null check (slot_index between 1 and 3),
    used_at timestamptz,
    created_at timestamptz not null default now(),
    unique (account_id, utc_day, slot_index)
);
