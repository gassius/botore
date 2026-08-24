-- 0005: append-only ledgers + analytics outbox + admin audit log
create table public.progression_ledger (
    entry_id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id),
    character_id text not null references public.characters (character_id),
    battle_id uuid references public.battles (battle_id),
    delta_xp integer not null check (delta_xp in (1, 2)),
    reason text not null check (reason in ('battle')),
    created_at timestamptz not null default now()
);

-- Append-only enforcement: no updates or deletes ever.
create rule progression_ledger_no_update as
    on update to public.progression_ledger do instead nothing;
create rule progression_ledger_no_delete as
    on delete to public.progression_ledger do instead nothing;

create table public.analytics_outbox (
    event_id uuid primary key,
    event_name text not null,
    schema_version integer not null,
    context jsonb not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);

create index analytics_outbox_pending_idx
    on public.analytics_outbox (created_at)
    where processed_at is null;

create table public.admin_audit_log (
    audit_id uuid primary key default gen_random_uuid(),
    actor text not null,
    action text not null,
    details jsonb not null default '{}',
    created_at timestamptz not null default now()
);

create rule admin_audit_no_update as
    on update to public.admin_audit_log do instead nothing;
create rule admin_audit_no_delete as
    on delete to public.admin_audit_log do instead nothing;
