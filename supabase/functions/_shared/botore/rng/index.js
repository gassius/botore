/**
 * Public entry: versioned seeded PRNG abstraction + sha256-counter-v1.
 * PURE PACKAGE — no Node/browser APIs, no clocks, no Math.random().
 */
export const SHA256_ALGORITHM = 'sha256-counter-v1';
export { createSha256Rng } from './sha256-counter.js';
export { seedToKeyMaterial, deriveSeed } from './seed.js';
//# sourceMappingURL=index.js.map