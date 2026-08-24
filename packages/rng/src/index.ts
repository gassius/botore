/**
 * Public entry: versioned seeded PRNG abstraction + sha256-counter-v1.
 * PURE PACKAGE — no Node/browser APIs, no clocks, no Math.random().
 */

/** Uniform integer interface consumed by the combat engine. */
export interface Rng {
  readonly algorithm: string;
  /** Next uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Next uniform integer in [minInclusive, maxInclusive]. */
  nextIntInRange(minInclusive: number, maxInclusive: number): number;
}

export const SHA256_ALGORITHM = 'sha256-counter-v1';

export { createSha256Rng } from './sha256-counter.js';
export { seedToKeyMaterial, deriveSeed } from './seed.js';
export type { Seed } from './seed.js';
