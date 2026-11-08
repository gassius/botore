import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEdgeHealthReady,
  shouldContinueWaiting,
  waitForEdgeHealth,
} from './wait-edge-health.mjs';

describe('wait-edge-health readiness', () => {
  it('treats only HTTP 200 as ready', () => {
    assert.equal(isEdgeHealthReady(200), true);
    assert.equal(isEdgeHealthReady(503), false);
    assert.equal(isEdgeHealthReady(404), false);
    assert.equal(isEdgeHealthReady(0), false);
  });

  it('continues waiting on startup 5xx / 404 / network', () => {
    for (const status of [0, 404, 500, 502, 503]) {
      assert.equal(shouldContinueWaiting(status), true, String(status));
    }
    assert.equal(shouldContinueWaiting(200), false);
  });

  it('503→200 startup sequence becomes ready', async () => {
    const sequence = [503, 503, 200];
    let i = 0;
    const result = await waitForEdgeHealth({
      timeoutSec: 5,
      sleep: async () => {},
      log: () => {},
      probe: async () => sequence[Math.min(i++, sequence.length - 1)],
    });
    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.attempts, 3);
  });

  it('persistent 503 times out', async () => {
    const result = await waitForEdgeHealth({
      timeoutSec: 3,
      sleep: async () => {},
      log: () => {},
      probe: async () => 503,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timeout');
    assert.equal(result.httpStatus, 503);
    assert.equal(result.attempts, 3);
  });
});
