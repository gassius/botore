/**
 * Shared combat Edge smoke assertions (F2/F3).
 * Skip only when the function is clearly unserved (HTTP 404).
 * Unexpected statuses and invalid success payloads fail.
 */

/**
 * @param {number} status
 * @param {unknown} body
 * @returns {{ action: 'ok' | 'skip' | 'fail', reason?: string }}
 */
export function classifyCombatSmokeResponse(status, body) {
  if (status === 404) {
    return { action: 'skip', reason: 'unserved' };
  }
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    return { action: 'fail', reason: `unexpected HTTP ${status}` };
  }
  if (!body || typeof body !== 'object') {
    return { action: 'fail', reason: 'invalid JSON body' };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  if (b.status !== 'completed') {
    return { action: 'fail', reason: `status=${String(b.status)}` };
  }
  if (b.persistence !== 'persisted' && b.persistence !== 'repeated') {
    return { action: 'fail', reason: 'persistence flag' };
  }
  if (typeof b.xpAwarded !== 'number' || b.xpAwarded < 1 || b.xpAwarded > 2) {
    return { action: 'fail', reason: 'xpAwarded' };
  }
  if (typeof b.replayChecksum !== 'string' || !/^[0-9a-f]{64}$/.test(b.replayChecksum)) {
    return { action: 'fail', reason: 'replayChecksum' };
  }
  const replay = b.replay;
  if (!replay || typeof replay !== 'object') {
    return { action: 'fail', reason: 'missing replay' };
  }
  const r = /** @type {Record<string, unknown>} */ (replay);
  if (!Array.isArray(r.events) || r.events.length === 0) {
    return { action: 'fail', reason: 'missing semantic events' };
  }
  if (r.rulesVersion !== 'combat-v1') {
    return { action: 'fail', reason: 'rulesVersion' };
  }
  if (typeof b.seed !== 'string' || !/^[0-9a-f]{64}$/.test(b.seed)) {
    return { action: 'fail', reason: 'seed shape' };
  }
  if (typeof r.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(r.checksum)) {
    return { action: 'fail', reason: 'checksum shape' };
  }
  return { action: 'ok' };
}
