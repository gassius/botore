-- 0006: row-level security — deny-by-default for the public/mobile role
--
-- The API uses the postgres server credential (bypasses RLS) via env config.
-- Clients (anon/authenticated Supabase roles) must NOT be able to write
-- battle results, allowances, or ledgers. Reads are limited to own rows.

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.consents enable row level security;
alter table public.characters enable row level security;
alter table public.character_build_versions enable row level security;
alter table public.fight_allowances enable row level security;
alter table public.battles enable row level security;
alter table public.battle_participants enable row level security;
alter table public.battle_commands enable row level security;
alter table public.battle_replays enable row level security;
alter table public.progression_ledger enable row level security;
alter table public.analytics_outbox enable row level security;
alter table public.admin_audit_log enable row level security;

-- No policies are created for writes on protected tables: with RLS enabled
-- and no policy, all operations are denied for non-bypassing roles.
-- That is intentional: deny-by-default.

-- Read-only allowances for clients:
create policy "own profile read" on public.profiles
    for select using (account_id = auth.uid());

create policy "opponent roster read" on public.characters
    for select using (is_opponent = true);

create policy "own character read" on public.characters
    for select using (account_id = auth.uid());

-- current_character_builds is a VIEW: RLS policies do not apply. Access is
-- governed by the underlying tables' policies plus a grant:
grant select on public.current_character_builds to authenticated, anon;

create policy "own battles read" on public.battles
    for select using (initiator_account_id = auth.uid());

create policy "own battle replays read" on public.battle_replays
    for select using (
        exists (
            select 1 from public.battles b
            where b.battle_id = battle_replays.battle_id
              and b.initiator_account_id = auth.uid()
        )
    );

create policy "own progression read" on public.progression_ledger
    for select using (account_id = auth.uid());

create policy "own allowances read" on public.fight_allowances
    for select using (account_id = auth.uid());
