/**
 * Backend health Edge Function entrypoint (B1).
 *
 * Local: `pnpm exec supabase functions serve`
 * Smoke: `REQUIRE_EDGE_FUNCTIONS=1 node scripts/backend-smoke.mjs`
 */
import { createDefaultHealthDeps } from './deps.ts';
import { handleHealthRequest } from './handler.ts';

Deno.serve((req) => handleHealthRequest(req, createDefaultHealthDeps(Deno.env)));
