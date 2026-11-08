-- 0009: append-only inventory ledger (owned parts)
--
-- Ownership is reconstructable from this ledger. Materialized balances live
-- in the inventory_balances view. Clients never write this table.

create table public.inventory_ledger (
    entry_id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id),
    part_id text not null references public.parts_catalogue (part_id),
    delta integer not null check (delta <> 0),
    reason text not null
        check (reason in ('seed', 'grant', 'purchase', 'revoke', 'admin')),
    created_at timestamptz not null default now(),
    -- Optional correlation for future purchases / fights; unused in F1.
    ref_id uuid
);

create index inventory_ledger_account_part_idx
    on public.inventory_ledger (account_id, part_id, created_at);

create rule inventory_ledger_no_update as
    on update to public.inventory_ledger do instead nothing;
create rule inventory_ledger_no_delete as
    on delete to public.inventory_ledger do instead nothing;

-- Reconstructable balances (> 0 only).
create view public.inventory_balances
with (security_invoker = true) as
select
    account_id,
    part_id,
    sum(delta)::integer as quantity
from public.inventory_ledger
group by account_id, part_id
having sum(delta) > 0;

grant select on public.inventory_balances to authenticated, anon;

comment on table public.inventory_ledger is
  'Append-only owned-parts ledger. Client never writes; balances via inventory_balances.';
