/**
 * combat-v1 fight Edge Function entrypoint (F2).
 *
 * Local: `pnpm exec supabase functions serve combat-v1`
 * Runtime evidence: `deno test -A supabase/functions/combat-v1`
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleCombatRequest, type CombatDeps, type FightContext } from './handler.ts';

function buildDeps(): CombatDeps {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  return {
    async getUserId(authHeader: string) {
      const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData.user) return null;
      return userData.user.id;
    },
    async prepareFightContext(accountId: string, opponentId: string) {
      const admin = createClient(supabaseUrl, serviceKey || anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: ctxRaw, error: ctxError } = await admin.rpc('prepare_fight_context', {
        p_account_id: accountId,
        p_opponent_id: opponentId,
      });
      if (ctxError) {
        throw new Error(ctxError.message);
      }
      return ctxRaw as FightContext;
    },
  };
}

Deno.serve((req) => handleCombatRequest(req, buildDeps()));
