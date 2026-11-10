/**
 * C10 — classify transport / auth failures for first-run UX.
 * Shared across Stable, Customise, Opponents, Confirm, Ranking, fight-start.
 */

export type SessionFailureKind = 'offline' | 'auth_expired' | 'other';

export type SessionFailureInput = {
  readonly code?: string | null | undefined;
  readonly message?: string | null | undefined;
  readonly httpStatus?: number | null | undefined;
};

const AUTH_CODES = new Set([
  'unauthenticated',
  'auth_expired',
  'session_expired',
  'jwt_expired',
  'pgrst301',
]);

const OFFLINE_CODES = new Set(['network_error', 'offline', 'timeout', 'abort', 'aborted']);

/**
 * Map adapter / HTTP failure fields into a player-facing failure kind.
 * Prefer explicit codes; fall back to HTTP status and message heuristics.
 */
export function classifySessionFailure(input: SessionFailureInput): SessionFailureKind {
  const code = (input.code ?? '').trim().toLowerCase();
  const message = (input.message ?? '').trim().toLowerCase();
  const status = input.httpStatus ?? null;

  if (OFFLINE_CODES.has(code) || code === 'http_0') {
    return 'offline';
  }
  if (AUTH_CODES.has(code) || code === 'http_401' || status === 401) {
    return 'auth_expired';
  }

  if (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('aborted') ||
    message.includes('offline')
  ) {
    return 'offline';
  }

  if (
    message.includes('jwt expired') ||
    (message.includes('jwt') && message.includes('expir')) ||
    message.includes('session expired') ||
    message.includes('not authenticated') ||
    message.includes('missing access token') ||
    message.includes('sign in again') ||
    message.includes('sign in to')
  ) {
    return 'auth_expired';
  }

  return 'other';
}

/**
 * Normalize adapter failure codes so screens can classify consistently.
 * 401 / JWT → `unauthenticated`; fetch throws → `network_error`.
 */
export function resolveTransportFailureCode(input: SessionFailureInput): string {
  const kind = classifySessionFailure(input);
  if (kind === 'offline') return 'network_error';
  if (kind === 'auth_expired') return 'unauthenticated';
  const code = (input.code ?? '').trim();
  if (code) return code;
  if (typeof input.httpStatus === 'number') return `http_${input.httpStatus}`;
  return 'unknown';
}
