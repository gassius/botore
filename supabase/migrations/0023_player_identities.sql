-- 0023: C12 platform identities (Game Center / Play Games / device fallback)
--
-- Maps a verified platform player id (or Keychain/Block Store device UUID) to
-- an auth.users / accounts row. Written only by the platform-auth Edge Function
-- (service_role). Clients have no direct table GRANT.

create table public.player_identities (
    identity_id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id) on delete cascade,
    provider text not null
        check (provider in ('game_center', 'play_games', 'device_fallback')),
    -- teamPlayerID / PGS player_id / random device UUID (never IDFV/ANDROID_ID)
    platform_id text not null
        check (char_length(platform_id) between 1 and 256),
    created_at timestamptz not null default now(),
    linked_at timestamptz,
    unique (provider, platform_id)
);

create index player_identities_account_id_idx
    on public.player_identities (account_id);

comment on table public.player_identities is
  'C12 platform auth mapping: Game Center / Play Games / device fallback → account. Edge service_role only.';

alter table public.player_identities enable row level security;

-- Deny-by-default: no client policies. Own-row read for authenticated (optional
-- settings UI later); writes stay Edge/service_role only.
create policy "own player identities read" on public.player_identities
    for select to authenticated
    using (account_id = auth.uid());

revoke all on table public.player_identities from public;
revoke all on table public.player_identities from anon;
revoke all on table public.player_identities from authenticated;
grant select on table public.player_identities to authenticated;
grant all on table public.player_identities to service_role;
