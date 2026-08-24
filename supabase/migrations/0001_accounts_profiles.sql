-- 0001: identities, accounts, profiles, consents, devices
create extension if not exists pgcrypto;

-- Accounts map 1:1 to auth.users via id.
create table public.accounts (
    id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

create table public.profiles (
    account_id uuid primary key references public.accounts (id) on delete cascade,
    display_name text not null check (char_length(display_name) between 1 and 48),
    created_at timestamptz not null default now()
);

create table public.devices (
    device_id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id) on delete cascade,
    platform text not null,
    created_at timestamptz not null default now(),
    unique (account_id, platform)
);

create table public.consents (
    consent_id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id) on delete cascade,
    kind text not null check (kind in ('analytics', 'advertising')),
    granted boolean not null,
    updated_at timestamptz not null default now(),
    unique (account_id, kind)
);
