/**
 * Versioned seeded PRNG abstraction.
 *
 * PURE PACKAGE — no Node/browser APIs, no clocks, no Math.random().
 * All randomness in the platform flows through `Rng` created by a named,
 * versioned algorithm so replays remain reproducible across runtimes.
 */
/** Uniform integer interface consumed by the combat engine. */
export interface Rng {
  readonly algorithm: string;
  /** Next uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Next uniform integer in [minInclusive, maxInclusive]. */
  nextIntInRange(minInclusive: number, maxInclusive: number): number;
}
export declare const SHA256_ALGORITHM = 'sha256-counter-v1';
