-- 0021: SECURITY DEFINER helpers for loadout RLS (no table GRANTs)
--
-- After SEC removed authenticated SELECT on public.characters, policies on
-- bot_loadout_versions that subquery characters fail with:
--   permission denied for table characters
-- even when the caller only SELECTs current_bot_loadouts / bot_loadout_versions.
--
-- Fix: evaluate ownership / opponent checks inside SECURITY DEFINER helpers
-- (same pattern as 0020 client-read RPCs). Do NOT GRANT SELECT on characters.

create or replace function public.bot_character_owned_by_caller(p_character_id text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from public.characters c
     where c.character_id = p_character_id
       and c.account_id = auth.uid()
       and c.is_opponent = false
  );
$$;

create or replace function public.bot_character_is_system_opponent(p_character_id text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from public.characters c
     where c.character_id = p_character_id
       and c.is_opponent = true
  );
$$;

revoke all on function public.bot_character_owned_by_caller(text) from public;
revoke all on function public.bot_character_owned_by_caller(text) from anon;
revoke all on function public.bot_character_owned_by_caller(text) from service_role;
grant execute on function public.bot_character_owned_by_caller(text) to authenticated;

revoke all on function public.bot_character_is_system_opponent(text) from public;
revoke all on function public.bot_character_is_system_opponent(text) from service_role;
-- anon may read opponent loadouts via current_bot_loadouts grant; keep EXECUTE.
grant execute on function public.bot_character_is_system_opponent(text)
    to authenticated, anon;

comment on function public.bot_character_owned_by_caller(text) is
  'RLS helper: true when character_id is the caller''s non-opponent character. SECURITY DEFINER; no characters table GRANT.';
comment on function public.bot_character_is_system_opponent(text) is
  'RLS helper: true when character_id is a system opponent. SECURITY DEFINER; no characters table GRANT.';

drop policy if exists "own loadout versions read" on public.bot_loadout_versions;
drop policy if exists "opponent loadout versions read" on public.bot_loadout_versions;

create policy "own loadout versions read" on public.bot_loadout_versions
    for select using (public.bot_character_owned_by_caller(character_id));

create policy "opponent loadout versions read" on public.bot_loadout_versions
    for select using (public.bot_character_is_system_opponent(character_id));
