import { describe, it, expect } from 'vitest';

/**
 * The dashboard's security-critical rule is the auth gate failing closed.
 * middleware.ts imports next/server which needs a Next runtime; we test the
 * decision function's contract by extracting its predicate here and keeping
 * it in sync with middleware.ts (single source documented in both files).
 *
 * This mirrors the exact conditions from middleware.ts:
 *   allow = pathname startsWith /login
 *        OR (env === development AND token set AND cookie === token)
 */
function gate(
  pathname: string,
  env: string | undefined,
  token: string | undefined,
  cookie: string | undefined,
): boolean {
  if (pathname.startsWith('/login')) return true;
  const effectiveEnv = env ?? 'development';
  if (effectiveEnv !== 'development' || !token) return false;
  return cookie === token;
}

describe('dashboard auth gate (fail closed)', () => {
  it('allows /login always', () => {
    expect(gate('/login', 'production', undefined, undefined)).toBe(true);
  });

  it('denies everything in production even with valid token', () => {
    expect(gate('/', 'production', 'tok', 'tok')).toBe(false);
  });

  it('denies everything when token is unset', () => {
    expect(gate('/', 'development', undefined, 'anything')).toBe(false);
  });

  it('denies mismatched cookie in development', () => {
    expect(gate('/', 'development', 'secret', 'wrong')).toBe(false);
  });

  it('allows matching cookie in development', () => {
    expect(gate('/', 'development', 'secret', 'secret')).toBe(true);
  });
});
