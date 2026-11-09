-- 0019: SEC — lock down historical admin grants (anon/authenticated)
--
-- gasnet REQUEST_CHANGES on B2 (#25) found SECURITY DEFINER admin helpers
-- callable by client JWT roles. B2 tip-fixed its own new RPCs; this migration
-- locks the earlier main surface (0013–0016):
--   * admin_* views
--   * backend_health_snapshot / outbox_status_snapshot / admin_list_cron_jobs
--
-- Numbering: 0019 leaves 0017/0018 for the F5/B2 stack so this PR can land
-- from main without colliding. Gaps are fine for Supabase CLI ordering.
--
-- Non-goals: dashboard UI; changing RLS policies; inventing a reporting role
-- (DASHBOARD_DATABASE_URL / postgres bypass remains the reporting path).

-- ---------------------------------------------------------------------------
-- Admin views: revoke client SELECT; keep service_role
-- ---------------------------------------------------------------------------
revoke all on table public.admin_catalogue_summary from public;
revoke all on table public.admin_catalogue_summary from anon;
revoke all on table public.admin_catalogue_summary from authenticated;
grant select on public.admin_catalogue_summary to service_role;

revoke all on table public.admin_inventory_overview from public;
revoke all on table public.admin_inventory_overview from anon;
revoke all on table public.admin_inventory_overview from authenticated;
grant select on public.admin_inventory_overview to service_role;

revoke all on table public.admin_loadout_overview from public;
revoke all on table public.admin_loadout_overview from anon;
revoke all on table public.admin_loadout_overview from authenticated;
grant select on public.admin_loadout_overview to service_role;

revoke all on table public.admin_fight_readiness from public;
revoke all on table public.admin_fight_readiness from anon;
revoke all on table public.admin_fight_readiness from authenticated;
grant select on public.admin_fight_readiness to service_role;

revoke all on table public.admin_recent_battles from public;
revoke all on table public.admin_recent_battles from anon;
revoke all on table public.admin_recent_battles from authenticated;
grant select on public.admin_recent_battles to service_role;

revoke all on table public.admin_outbox_overview from public;
revoke all on table public.admin_outbox_overview from anon;
revoke all on table public.admin_outbox_overview from authenticated;
grant select on public.admin_outbox_overview to service_role;

revoke all on table public.admin_outbox_failures from public;
revoke all on table public.admin_outbox_failures from anon;
revoke all on table public.admin_outbox_failures from authenticated;
grant select on public.admin_outbox_failures to service_role;

-- ---------------------------------------------------------------------------
-- Admin / health SECURITY DEFINER RPCs: service_role only
-- ---------------------------------------------------------------------------
revoke all on function public.backend_health_snapshot() from public;
revoke all on function public.backend_health_snapshot() from anon;
revoke all on function public.backend_health_snapshot() from authenticated;
grant execute on function public.backend_health_snapshot() to service_role;

revoke all on function public.admin_list_cron_jobs() from public;
revoke all on function public.admin_list_cron_jobs() from anon;
revoke all on function public.admin_list_cron_jobs() from authenticated;
grant execute on function public.admin_list_cron_jobs() to service_role;

revoke all on function public.outbox_status_snapshot() from public;
revoke all on function public.outbox_status_snapshot() from anon;
revoke all on function public.outbox_status_snapshot() from authenticated;
grant execute on function public.outbox_status_snapshot() to service_role;

comment on function public.backend_health_snapshot() is
  'Backend health snapshot for Edge health / smoke / admin (service_role only).';
comment on function public.admin_list_cron_jobs() is
  'Scheduled botore pg_cron jobs for ops / admin (service_role only).';
comment on function public.outbox_status_snapshot() is
  'Aggregated outbox + cron status for ops / admin (service_role only).';
