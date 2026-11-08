-- 0012: RLS for bots-as-data tables
--
-- Deny-by-default writes for anon/authenticated. Reads:
--   - active catalogue parts: public
--   - own inventory ledger / balances: owner
--   - own character loadout versions + opponent loadouts: readable
-- Direct client INSERT/UPDATE/DELETE on catalogue, ledger, loadouts is denied;
-- confirmed saves go through save_bot_loadout().

alter table public.parts_catalogue enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.bot_loadout_versions enable row level security;

-- Catalogue: anyone can read active parts (stable / customisation preview).
create policy "active catalogue read" on public.parts_catalogue
    for select using (is_active = true);

-- Inventory: owner read only.
create policy "own inventory read" on public.inventory_ledger
    for select using (account_id = auth.uid());

-- Loadouts: own character or opponent (for fight preview / stable).
create policy "own loadout versions read" on public.bot_loadout_versions
    for select using (
        exists (
            select 1 from public.characters c
            where c.character_id = bot_loadout_versions.character_id
              and c.account_id = auth.uid()
        )
    );

create policy "opponent loadout versions read" on public.bot_loadout_versions
    for select using (
        exists (
            select 1 from public.characters c
            where c.character_id = bot_loadout_versions.character_id
              and c.is_opponent = true
        )
    );

-- No write policies: authenticated/anon cannot mutate these tables directly.
grant select on public.parts_catalogue to authenticated, anon;
grant select on public.inventory_ledger to authenticated, anon;
grant select on public.bot_loadout_versions to authenticated, anon;
