-- 0007: recreate current_character_builds with security_invoker
-- Clears Supabase SECURITY DEFINER view advisor warning and matches hosted production

drop view if exists public.current_character_builds;

create view public.current_character_builds
with (security_invoker = true) as
select distinct on (character_id)
  character_id, hp, strength, agility, speed, weapon_kind, weapon_power
from public.character_build_versions
order by character_id, created_at desc;

grant select on public.current_character_builds to authenticated, anon;
