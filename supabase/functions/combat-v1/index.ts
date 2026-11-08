/**
 * combat-v1 fight Edge Function entrypoint (F2).
 *
 * Local: `pnpm exec supabase functions serve combat-v1`
 * Runtime evidence: `deno test -A supabase/functions/combat-v1`
 */
import { createCombatDeps } from './deps.ts';
import { handleCombatRequest } from './handler.ts';

Deno.serve((req) => handleCombatRequest(req, createCombatDeps()));
