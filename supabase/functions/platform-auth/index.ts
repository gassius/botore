/**
 * platform-auth Edge Function entrypoint (C12).
 *
 * Local: `pnpm exec supabase functions serve platform-auth`
 * Tests: `deno test -A supabase/functions/platform-auth`
 */
import { createPlatformAuthDeps } from './deps.ts';
import { handlePlatformAuthRequest } from './handler.ts';

Deno.serve((req) => handlePlatformAuthRequest(req, createPlatformAuthDeps()));
