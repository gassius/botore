/**
 * Backend health Edge Function handler (B1).
 *
 * Reports database / catalogue / fight / pg_cron / outbox / Storage state via
 * `backend_health_snapshot()`, then adds live Edge Function reachability probes
 * so a future admin dashboard (B2) can read one envelope.
 *
 * Exported for Deno tests — `index.ts` is the thin Deno.serve entrypoint.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type SnapshotResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

export type EdgeProbe = {
  name: string;
  reachable: boolean;
  httpStatus: number | null;
  detail?: string;
};

export type HealthDeps = {
  fetchSnapshot: () => Promise<SnapshotResult>;
  /** Probe another Edge Function by name (e.g. combat-v1). */
  probeFunction: (name: string) => Promise<EdgeProbe>;
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Merge SQL snapshot with live Edge probes.
 * SQL `status` stays authoritative for DB/cron/storage; missing Edge peers
 * mark the envelope `degraded` so ops/smoke can see a single health signal.
 */
export function mergeHealthPayload(
  snapshot: Record<string, unknown>,
  edgeProbes: EdgeProbe[],
): Record<string, unknown> {
  const baseChecks =
    typeof snapshot['checks'] === 'object' && snapshot['checks'] !== null
      ? { ...(snapshot['checks'] as Record<string, unknown>) }
      : {};

  const edgeFunctions: Record<string, unknown> = {
    health: { reachable: true, role: 'self' },
  };
  for (const probe of edgeProbes) {
    edgeFunctions[probe.name] = {
      reachable: probe.reachable,
      httpStatus: probe.httpStatus,
      ...(probe.detail ? { detail: probe.detail } : {}),
    };
  }
  baseChecks['edge_functions'] = edgeFunctions;

  const sqlStatus = typeof snapshot['status'] === 'string' ? snapshot['status'] : 'error';
  const edgeOk = edgeProbes.every((p) => p.reachable);
  let status = sqlStatus;
  if (sqlStatus === 'ok' && !edgeOk) status = 'degraded';

  return {
    ...snapshot,
    status,
    service: 'health',
    checks: baseChecks,
  };
}

export async function handleHealthRequest(req: Request, deps: HealthDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { data, error } = await deps.fetchSnapshot();
    if (error || !data) {
      return json(
        {
          status: 'error',
          service: 'health',
          checks: {
            database: false,
            rpc: error?.message ?? 'empty_snapshot',
            edge_functions: { health: { reachable: true, role: 'self' } },
          },
        },
        503,
      );
    }

    const combatProbe = await deps.probeFunction('combat-v1');
    const body = mergeHealthPayload(data, [combatProbe]);
    return json(body, body['status'] === 'ok' ? 200 : 503);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(
      {
        status: 'error',
        service: 'health',
        checks: {
          database: false,
          exception: message,
          edge_functions: { health: { reachable: true, role: 'self' } },
        },
      },
      503,
    );
  }
}
