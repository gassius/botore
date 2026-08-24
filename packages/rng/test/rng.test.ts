import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createSha256Rng, deriveSeed, seedToKeyMaterial } from '../src/all.js';

describe('sha256-counter-v1', () => {
  it('is deterministic for the same key', () => {
    const key = seedToKeyMaterial(deriveSeed('botore/test/alpha'));
    const a = createSha256Rng(key);
    const b = createSha256Rng(key);
    const seqA = Array.from({ length: 50 }, () => a.nextInt(1000));
    const seqB = Array.from({ length: 50 }, () => b.nextInt(1000));
    expect(seqA).toEqual(seqB);
  });

  it('differs across keys', () => {
    const a = createSha256Rng(seedToKeyMaterial(deriveSeed('a')));
    const b = createSha256Rng(seedToKeyMaterial(deriveSeed('b')));
    expect(Array.from({ length: 8 }, () => a.nextInt(1 << 30))).not.toEqual(
      Array.from({ length: 8 }, () => b.nextInt(1 << 30)),
    );
  });

  it('produces golden values (frozen v1 vector)', () => {
    // Frozen test vector. If this fails, the algorithm changed — bump the version.
    const rng = createSha256Rng(new Uint8Array(32).fill(7));
    expect([rng.nextInt(6), rng.nextInt(6), rng.nextInt(6), rng.nextInt(6)]).toEqual([
      2, 5, 4, 1,
    ]);
  });

  it('stays in range and hits every bucket (uniformity smoke)', () => {
    const rng = createSha256Rng(seedToKeyMaterial(deriveSeed('uniformity')));
    const buckets = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      buckets.add(v);
    }
    expect(buckets.size).toBe(7);
  });

  it('property: nextInt always within [0, maxExclusive)', () => {
    const key = seedToKeyMaterial(deriveSeed('prop'));
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 0xffff }),
        fc.integer({ min: 0, max: 999 }),
        (max, drawCount) => {
          const rng = createSha256Rng(key);
          let last = -1;
          for (let i = 0; i <= drawCount; i++) {
            last = rng.nextInt(max);
            if (last < 0 || last >= max) return false;
          }
          return last >= 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: nextIntInRange covers closed interval', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 0 }),
        fc.integer({ min: 1, max: 1000 }),
        (lo, hiOff) => {
          const hi = lo + hiOff;
          const rng = createSha256Rng(seedToKeyMaterial(deriveSeed(`r:${lo}:${hi}`)));
          for (let i = 0; i < 64; i++) {
            const v = rng.nextIntInRange(lo, hi);
            if (v < lo || v > hi) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects invalid keys and ranges', () => {
    expect(() => createSha256Rng(new Uint8Array(0))).toThrow();
    expect(() => createSha256Rng(new Uint8Array(33))).toThrow();
    const rng = createSha256Rng(new Uint8Array(32));
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.nextInt(1.5)).toThrow();
    expect(() => rng.nextIntInRange(5, 4)).toThrow();
  });
});
