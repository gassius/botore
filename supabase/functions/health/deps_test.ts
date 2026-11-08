/**
 * Wiring tests for createDefaultHealthDeps probe classification (B1 PRR).
 * Injects fetch — covers 200 / 4xx / 5xx / timeout so aggregate health cannot
 * treat a failing Edge runtime as reachable.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createDefaultHealthDeps } from './deps.ts';
import {
  classifyEdgeProbe,
  handleHealthRequest,
  isEdgePeerReachable,
  mergeHealthPayload,
} from './handler.ts';

function okSnapshot(): Record<string, unknown> {
  return {
    status: 'ok',
    checks: {
      database: true,
      storage: { atlas_bucket: true },
      pg_cron: { present: true },
      analytics_outbox: { pending: 0 },
    },
    checked_at: '2026-11-08T00:00:00.000Z',
  };
}

function envStub() {
  return {
    get(key: string) {
      if (key === 'SUPABASE_URL') return 'http://edge.test';
      if (key === 'SUPABASE_ANON_KEY') return 'test-anon';
      return undefined;
    },
  };
}

function statusFetch(status: number) {
  return (_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response('probe', { status }));
}

Deno.test('isEdgePeerReachable: only HTTP 2xx is healthy', () => {
  assertEquals(isEdgePeerReachable(200), true);
  assertEquals(isEdgePeerReachable(204), true);
  assertEquals(isEdgePeerReachable(null), false);
  for (const status of [401, 403, 404, 429, 500, 502, 503]) {
    assertEquals(isEdgePeerReachable(status), false, `status ${status} must be unreachable`);
  }
});

Deno.test('classifyEdgeProbe tags 5xx as gateway_or_runtime_error', () => {
  for (const status of [500, 502, 503]) {
    const probe = classifyEdgeProbe('combat-v1', status);
    assertEquals(probe.reachable, false);
    assertEquals(probe.detail, 'gateway_or_runtime_error');
  }
});

Deno.test('classifyEdgeProbe tags odd non-2xx as unexpected_status', () => {
  const probe = classifyEdgeProbe('combat-v1', 418);
  assertEquals(probe.reachable, false);
  assertEquals(probe.detail, 'unexpected_status_418');
});

Deno.test('createDefaultHealthDeps: OPTIONS 200 ⇒ reachable', async () => {
  const deps = createDefaultHealthDeps(envStub(), { fetch: statusFetch(200) });
  const probe = await deps.probeFunction('combat-v1');
  assertEquals(probe, { name: 'combat-v1', reachable: true, httpStatus: 200 });
});

Deno.test('createDefaultHealthDeps: 401/403/404/429 ⇒ unreachable', async () => {
  for (const status of [401, 403, 404, 429]) {
    const deps = createDefaultHealthDeps(envStub(), { fetch: statusFetch(status) });
    const probe = await deps.probeFunction('combat-v1');
    assertEquals(probe.reachable, false, `status ${status}`);
    assertEquals(probe.httpStatus, status);
  }
});

Deno.test('createDefaultHealthDeps: 500/502/503 ⇒ unreachable (not false-healthy)', async () => {
  for (const status of [500, 502, 503]) {
    const deps = createDefaultHealthDeps(envStub(), { fetch: statusFetch(status) });
    const probe = await deps.probeFunction('combat-v1');
    assertEquals(probe.reachable, false, `status ${status} must not count as reachable`);
    assertEquals(probe.httpStatus, status);
    assertEquals(probe.detail, 'gateway_or_runtime_error');
  }
});

Deno.test('createDefaultHealthDeps: transport timeout ⇒ unreachable', async () => {
  const deps = createDefaultHealthDeps(envStub(), {
    fetch: () => Promise.reject(new Error('AbortError: timed out')),
  });
  const probe = await deps.probeFunction('combat-v1');
  assertEquals(probe.reachable, false);
  assertEquals(probe.httpStatus, null);
  assertEquals(probe.detail, 'AbortError: timed out');
});

Deno.test(
  'aggregate: SQL ok + combat 503 probe ⇒ HTTP 503 degraded (via real deps wiring)',
  async () => {
    const live = createDefaultHealthDeps(envStub(), { fetch: statusFetch(503) });
    const deps = {
      fetchSnapshot: () => Promise.resolve({ data: okSnapshot(), error: null }),
      probeFunction: (name: string) => live.probeFunction(name),
    };
    const res = await handleHealthRequest(new Request('http://local/health'), deps);
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.status, 'degraded');
    assertEquals(body.checks.edge_functions['combat-v1'].reachable, false);
    assertEquals(body.checks.edge_functions['combat-v1'].httpStatus, 503);
  },
);

Deno.test('mergeHealthPayload: 5xx-classified probe degrades ok SQL snapshot', () => {
  const probe = classifyEdgeProbe('combat-v1', 502);
  const body = mergeHealthPayload(okSnapshot(), [probe]);
  assertEquals(body['status'], 'degraded');
});
