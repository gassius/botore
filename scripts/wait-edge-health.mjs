#!/usr/bin/env node
/**
 * Poll Edge /functions/v1/health until HTTP 200 (healthy ready), or timeout.
 *
 * Used by CI so required smoke does not start on a transient 5xx during
 * `supabase functions serve` startup. Exports pure helpers for unit tests.
 *
 * Usage:
 *   node scripts/wait-edge-health.mjs
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... WAIT_EDGE_TIMEOUT_SEC=60 node scripts/wait-edge-health.mjs
 */
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** HTTP statuses that mean "keep waiting" during Edge startup. */
export function shouldContinueWaiting(httpStatus) {
  if (httpStatus === 0 || httpStatus === null || httpStatus === undefined) return true;
  if (httpStatus === 404) return true;
  if (httpStatus >= 500 && httpStatus <= 599) return true;
  return false;
}

/** Ready only on successful health response. */
export function isEdgeHealthReady(httpStatus) {
  return httpStatus === 200;
}

/**
 * @param {object} opts
 * @param {() => Promise<number>} opts.probe - returns HTTP status (0 = network fail)
 * @param {number} opts.timeoutSec
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {(msg: string) => void} [opts.log]
 */
export async function waitForEdgeHealth(opts) {
  const timeoutSec = opts.timeoutSec;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = opts.log ?? console.log;
  let last = 0;

  for (let i = 1; i <= timeoutSec; i++) {
    last = await opts.probe();
    if (isEdgeHealthReady(last)) {
      log(`Edge health ready (HTTP ${last}) after ${i}s`);
      return { ok: true, httpStatus: last, attempts: i };
    }
    if (!shouldContinueWaiting(last) && last !== 200) {
      // Unexpected non-retryable client error (e.g. 401 misconfig) — fail fast.
      if (last >= 400 && last < 500 && last !== 404) {
        return { ok: false, httpStatus: last, attempts: i, reason: 'non_retryable' };
      }
    }
    await sleep(1000);
  }

  return { ok: false, httpStatus: last, attempts: timeoutSec, reason: 'timeout' };
}

async function main() {
  const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? '';
  const timeoutSec = Number(process.env.WAIT_EDGE_TIMEOUT_SEC ?? '60');

  const result = await waitForEdgeHealth({
    timeoutSec,
    async probe() {
      try {
        const res = await fetch(`${url}/functions/v1/health`, {
          headers: {
            apikey: key || 'wait',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          signal: AbortSignal.timeout(4000),
        });
        return res.status;
      } catch {
        return 0;
      }
    },
  });

  if (!result.ok) {
    console.error(
      `WAIT-EDGE-HEALTH FAIL: ${result.reason ?? 'not_ready'} lastHTTP=${result.httpStatus} after ${result.attempts}s`,
    );
    process.exit(1);
  }
}

const isMain =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
