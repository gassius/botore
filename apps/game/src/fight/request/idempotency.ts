/**
 * F3 idempotency keys for combat-v1.
 * Generate once per user "Start fight" intent; reuse on double-tap / network retry.
 * Edge requires 8..128 chars (handler.ts).
 */

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidIdempotencyKey(key: string): boolean {
  return KEY_RE.test(key);
}

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/** Cryptographically-strong-enough UUID for client intent keys (RN / web). */
export function createFightIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: CryptoLike }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `fight-${cryptoObj.randomUUID()}`;
  }
  // Fallback when randomUUID is unavailable (rare on modern RN/web).
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `fight-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Hold the active intent key so a second tap before settle reuses the same key.
 * Opponent change clears the intent (new fight = new key).
 */
export type FightIntent = {
  readonly opponentId: string;
  readonly idempotencyKey: string;
};

export function resolveFightIntent(current: FightIntent | null, opponentId: string): FightIntent {
  if (current && current.opponentId === opponentId) return current;
  return { opponentId, idempotencyKey: createFightIdempotencyKey() };
}
