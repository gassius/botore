/**
 * Live Supabase / HTTP wiring for the health Edge Function (B1).
 * Kept separate from handler.ts so Deno coverage gates measure the
 * pure merge/request logic under unit tests; deps wiring is covered by
 * deps_test.ts with an injectable fetch.
 */
import { classifyEdgeProbe, type HealthDeps } from './handler.ts';

export type HealthFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CreateHealthDepsOptions = {
  /** Override fetch (tests inject status/timeout behavior). */
  fetch?: HealthFetch;
};

export function createDefaultHealthDeps(
  env: { get(key: string): string | undefined },
  options: CreateHealthDepsOptions = {},
): HealthDeps {
  const url = env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321';
  const key = env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env.get('SUPABASE_ANON_KEY') ?? '';
  const fetchImpl: HealthFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async fetchSnapshot() {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.rpc('backend_health_snapshot');
      return {
        data: (data as Record<string, unknown> | null) ?? null,
        error: error ? { message: error.message } : null,
      };
    },
    async probeFunction(name: string) {
      try {
        const res = await fetchImpl(`${url}/functions/v1/${name}`, {
          method: 'OPTIONS',
          headers: {
            apikey: key || 'health-probe',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          signal: AbortSignal.timeout(4000),
        });
        return classifyEdgeProbe(name, res.status);
      } catch (err) {
        return classifyEdgeProbe(name, null, err instanceof Error ? err.message : String(err));
      }
    },
  };
}
