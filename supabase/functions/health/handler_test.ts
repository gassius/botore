/**
 * Deno unit tests for the B1 health Edge handler.
 * Mocks RPC + Edge probes — no live Supabase required.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  handleHealthRequest,
  mergeHealthPayload,
  type EdgeProbe,
  type HealthDeps,
} from './handler.ts';

function okSnapshot(): Record<string, unknown> {
  return {
    status: 'ok',
    checks: {
      database: true,
      parts_catalogue: { proof_seed_ok: true },
      storage: { atlas_bucket: true },
      pg_cron: { present: true, outbox_drain_scheduled: true },
      analytics_outbox: { pending: 0, processor: 'process_analytics_outbox' },
      fight: { edge_function: 'combat-v1', persistence: 'persist_fight_result' },
    },
    checked_at: '2026-11-08T00:00:00.000Z',
  };
}

Deno.test('mergeHealthPayload keeps ok when Edge peers reachable', () => {
  const probes: EdgeProbe[] = [{ name: 'combat-v1', reachable: true, httpStatus: 200 }];
  const body = mergeHealthPayload(okSnapshot(), probes);
  assertEquals(body['status'], 'ok');
  assertEquals(body['service'], 'health');
  const checks = body['checks'] as Record<string, unknown>;
  const edge = checks['edge_functions'] as Record<string, Record<string, unknown>>;
  assertEquals(edge['health']?.['reachable'], true);
  assertEquals(edge['combat-v1']?.['reachable'], true);
  assertEquals(edge['combat-v1']?.['httpStatus'], 200);
});

Deno.test('mergeHealthPayload degrades when Edge peer missing', () => {
  const probes: EdgeProbe[] = [
    { name: 'combat-v1', reachable: false, httpStatus: 404, detail: 'not mounted' },
  ];
  const body = mergeHealthPayload(okSnapshot(), probes);
  assertEquals(body['status'], 'degraded');
  const checks = body['checks'] as Record<string, unknown>;
  const edge = checks['edge_functions'] as Record<string, Record<string, unknown>>;
  assertEquals(edge['combat-v1']?.['reachable'], false);
  assertEquals(edge['combat-v1']?.['detail'], 'not mounted');
});

Deno.test('OPTIONS returns 200', async () => {
  const deps: HealthDeps = {
    fetchSnapshot: () => Promise.reject(new Error('unused')),
    probeFunction: () => Promise.reject(new Error('unused')),
  };
  const res = await handleHealthRequest(
    new Request('http://local/health', { method: 'OPTIONS' }),
    deps,
  );
  assertEquals(res.status, 200);
});

Deno.test('handler returns 503 when RPC fails', async () => {
  const deps: HealthDeps = {
    fetchSnapshot: () => Promise.resolve({ data: null, error: { message: 'rpc down' } }),
    probeFunction: () => Promise.resolve({ name: 'combat-v1', reachable: true, httpStatus: 200 }),
  };
  const res = await handleHealthRequest(new Request('http://local/health'), deps);
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.status, 'error');
  assertEquals(body.service, 'health');
  assertEquals(body.checks.database, false);
  assertEquals(body.checks.rpc, 'rpc down');
});

Deno.test('handler returns 200 when snapshot ok and combat reachable', async () => {
  const deps: HealthDeps = {
    fetchSnapshot: () => Promise.resolve({ data: okSnapshot(), error: null }),
    probeFunction: (name) => Promise.resolve({ name, reachable: true, httpStatus: 200 }),
  };
  const res = await handleHealthRequest(new Request('http://local/health'), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, 'ok');
  assertEquals(body.checks.edge_functions['combat-v1'].reachable, true);
  assertEquals(body.checks.storage.atlas_bucket, true);
  assertEquals(body.checks.pg_cron.present, true);
});

Deno.test('handler returns 503 degraded when combat unreachable', async () => {
  const deps: HealthDeps = {
    fetchSnapshot: () => Promise.resolve({ data: okSnapshot(), error: null }),
    probeFunction: (name) => Promise.resolve({ name, reachable: false, httpStatus: 404 }),
  };
  const res = await handleHealthRequest(new Request('http://local/health'), deps);
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.status, 'degraded');
  assertEquals(body.checks.edge_functions['combat-v1'].reachable, false);
});

Deno.test('handler returns 503 on unexpected exception', async () => {
  const deps: HealthDeps = {
    fetchSnapshot: () => Promise.reject(new Error('boom')),
    probeFunction: () => Promise.reject(new Error('unused')),
  };
  const res = await handleHealthRequest(new Request('http://local/health'), deps);
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.status, 'error');
  assertEquals(body.checks.exception, 'boom');
});
