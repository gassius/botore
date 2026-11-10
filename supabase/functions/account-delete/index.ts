/**
 * account-delete Edge Function entrypoint (R5).
 *
 * Local: `pnpm exec supabase functions serve account-delete`
 * Runtime evidence: `deno test -A --config=supabase/functions/account-delete/deno.json supabase/functions/account-delete`
 */
import { createAccountDeleteDeps } from './deps.ts';
import { handleAccountDeleteRequest } from './handler.ts';

Deno.serve((req) => handleAccountDeleteRequest(req, createAccountDeleteDeps()));
