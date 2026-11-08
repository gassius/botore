/**
 * Shared combat Edge smoke assertions (P2).
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
  if (b.status !== 'computed') {
    return { action: 'fail', reason: `status=${String(b.status)}` };
  }
  if (b.persistence !== 'pending_f3') {
    return { action: 'fail', reason: 'persistence flag' };
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
