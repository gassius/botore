-- 0038: CLAIM — Loadout Equip Fix (BT-243)
-- get_owned_character must re-run ensure_player_character for existing
-- characters so A6 catalogue inventory grants sync on hydrate (returning
-- players). Body filled in the same PR; this file claims the prefix.
--
-- Do not reuse 0038. Fight-end / name-input workers: use 0039+.
-- Carlos yes required before apply / merge (Supabase Infra owns migrations).

select 1;
