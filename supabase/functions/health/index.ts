/**
 * Backend health Edge Function (B1, folded into F1).
 *
 * Reports database connectivity via backend_health_snapshot(), including
 * catalogue proof seed, loadouts, analytics outbox depth, pg_cron presence,
 * and the atlas Storage bucket. Designed so a future admin dashboard (B2)
 * can poll the same shape.
 *
 * Local: `pnpm exec supabase functions serve health --env-file ...`
 * Smoke: `node scripts/backend-smoke.mjs`
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc('backend_health_snapshot');
    if (error) {
      return json(
        {
          status: 'error',
          service: 'health',
          checks: { database: false, rpc: error.message },
        },
        503,
      );
    }

    const snapshot = data as Record<string, unknown>;
    const status = typeof snapshot['status'] === 'string' ? snapshot['status'] : 'error';
    return json(
      {
        ...snapshot,
        service: 'health',
      },
      status === 'ok' ? 200 : 503,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        status: 'error',
        service: 'health',
        checks: { database: false, exception: message },
      },
      503,
    );
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
