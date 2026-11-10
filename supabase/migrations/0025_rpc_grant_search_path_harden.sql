-- 0025: B4 — harden RPC EXECUTE grants + pin mutable search_path
--
-- ClickUp: B4 Harden RPC grants + search_path + Edge deploy CI (1amjtreye8f)
--
-- 1) Grants — revoke default PUBLIC / anon / authenticated EXECUTE on atlas
--    helpers that 0017 left open (trigger helpers never revoked) and re-lock
--    the intentional service_role surface from 0017. prepare_fight_context is
--    handled separately below.
--
-- 2) prepare_fight_context grant decision (documented):
--    KEEP EXECUTE for authenticated + service_role.
--    - Confirm / eligibility in the game client calls this RPC with the user
--      JWT (apps/game SupabaseOpponentCandidatesAdapter.prepareEligibility).
--    - Body gate already requires auth.uid() = p_account_id for authenticated
--      callers; service_role is the combat-v1 Edge path after JWT verify.
--    - Revoke PUBLIC + anon only. Do not make this Edge-only without a client
--      redesign that moves eligibility behind an Edge Function.
--
-- 3) search_path — Supabase advisor `function_search_path_mutable` on the
--    Development project after 0001–0024 flags the five functions below that
--    were created without a fixed search_path (verified in-repo; the grant
--    set from item 1 already had SET search_path in 0014/0017). Pin them.
--    Re-assert pinned search_path on the grant-set functions for hosted
--    drift safety.

-- ---------------------------------------------------------------------------
-- Grants: atlas helpers (service_role only, per 0017 intent)
-- ---------------------------------------------------------------------------
revoke all on function public.atlas_lock_versions(text[]) from public;
revoke all on function public.atlas_lock_versions(text[]) from anon;
revoke all on function public.atlas_lock_versions(text[]) from authenticated;
grant execute on function public.atlas_lock_versions(text[]) to service_role;

revoke all on function public.atlas_version_status(text) from public;
revoke all on function public.atlas_version_status(text) from anon;
revoke all on function public.atlas_version_status(text) from authenticated;
grant execute on function public.atlas_version_status(text) to service_role;

-- Trigger helpers: never had explicit revoke in 0017 (default PUBLIC EXECUTE).
revoke all on function public.atlas_storage_objects_guard() from public;
revoke all on function public.atlas_storage_objects_guard() from anon;
revoke all on function public.atlas_storage_objects_guard() from authenticated;
grant execute on function public.atlas_storage_objects_guard() to service_role;

revoke all on function public.atlas_manifest_entries_immutability() from public;
revoke all on function public.atlas_manifest_entries_immutability() from anon;
revoke all on function public.atlas_manifest_entries_immutability() from authenticated;
grant execute on function public.atlas_manifest_entries_immutability() to service_role;

comment on function public.atlas_lock_versions(text[]) is
  'Sorted per-version FOR UPDATE locks for atlas publish/mutations. service_role EXECUTE only (B4/0025).';
comment on function public.atlas_version_status(text) is
  'Atlas version status lookup for immutability guards. service_role EXECUTE only (B4/0025).';
comment on function public.atlas_storage_objects_guard() is
  'Storage objects immutability trigger for published atlas prefixes. service_role EXECUTE only (B4/0025); triggers still fire as owner.';
comment on function public.atlas_manifest_entries_immutability() is
  'Manifest entries immutability trigger for published atlas versions. service_role EXECUTE only (B4/0025); triggers still fire as owner.';

-- ---------------------------------------------------------------------------
-- Grants: prepare_fight_context — authenticated + service_role (see header)
-- ---------------------------------------------------------------------------
revoke all on function public.prepare_fight_context(uuid, text) from public;
revoke all on function public.prepare_fight_context(uuid, text) from anon;
revoke all on function public.prepare_fight_context(uuid, text) from authenticated;
revoke all on function public.prepare_fight_context(uuid, text) from service_role;
grant execute on function public.prepare_fight_context(uuid, text)
    to service_role, authenticated;

comment on function public.prepare_fight_context(uuid, text) is
  'F2 eligibility + immutable fighter snapshots. EXECUTE: authenticated (own account via auth.uid()) + service_role (combat-v1). PUBLIC/anon revoked (B4/0025). Does not consume allowance (F3).';

-- ---------------------------------------------------------------------------
-- search_path pins — advisor-flagged mutable set (verified vs grant set)
-- ---------------------------------------------------------------------------
-- Grant-set functions already pinned in 0014/0017; re-assert for drift:
alter function public.atlas_lock_versions(text[])
  set search_path = public;
alter function public.atlas_version_status(text)
  set search_path = public;
alter function public.atlas_manifest_entries_immutability()
  set search_path = public;
alter function public.atlas_storage_objects_guard()
  set search_path = public, storage;
alter function public.prepare_fight_context(uuid, text)
  set search_path = public, extensions;

-- Advisor mutable search_path (no SET in original CREATE):
alter function public._final_hp_from_replay(jsonb, text, integer)
  set search_path = public;
alter function public._outbox_validate_row(text, integer, jsonb, jsonb)
  set search_path = public;
alter function public.atlas_versions_immutability()
  set search_path = public;
alter function public.battle_participant_pin_atlas_version()
  set search_path = public;
alter function public.atlas_storage_prefix(text, text)
  set search_path = public;
