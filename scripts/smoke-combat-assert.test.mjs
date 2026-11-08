import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCombatSmokeResponse } from './smoke-combat-assert.mjs';

const okBody = {
  status: 'completed',
  persistence: 'persisted',
  xpAwarded: 2,
  replayChecksum: 'cd'.repeat(32),
  seed: 'ab'.repeat(32),
  replay: {
    rulesVersion: 'combat-v1',
    events: [{ type: 'battle_started' }],
    checksum: 'cd'.repeat(32),
  },
};

describe('classifyCombatSmokeResponse', () => {
  it('skips only HTTP 404 (unserved)', () => {
    assert.deepEqual(classifyCombatSmokeResponse(404, null), {
      action: 'skip',
      reason: 'unserved',
    });
  });

  it('fails unexpected non-2xx (401/500/503)', () => {
    for (const status of [401, 500, 503, 302]) {
      const r = classifyCombatSmokeResponse(status, okBody);
      assert.equal(r.action, 'fail');
      assert.match(r.reason ?? '', /unexpected HTTP/);
    }
  });

  it('fails invalid success payloads', () => {
    assert.equal(classifyCombatSmokeResponse(200, null).action, 'fail');
    assert.equal(classifyCombatSmokeResponse(200, { status: 'computed' }).action, 'fail');
    assert.equal(
      classifyCombatSmokeResponse(200, { ...okBody, persistence: 'pending_f3' }).action,
      'fail',
    );
    assert.equal(
      classifyCombatSmokeResponse(200, {
        ...okBody,
        replay: { ...okBody.replay, events: [] },
      }).action,
      'fail',
    );
    assert.equal(classifyCombatSmokeResponse(200, { ...okBody, seed: 'nope' }).action, 'fail');
    assert.equal(classifyCombatSmokeResponse(200, { ...okBody, xpAwarded: 0 }).action, 'fail');
  });

  it('accepts a valid persisted response', () => {
    assert.deepEqual(classifyCombatSmokeResponse(200, okBody), { action: 'ok' });
    assert.deepEqual(
      classifyCombatSmokeResponse(200, { ...okBody, persistence: 'repeated', xpAwarded: 1 }),
      { action: 'ok' },
    );
  });
});
