import { describe, it, expect } from 'vitest';
import { utcDay, allowancesRemaining } from '../src/allowances.js';

describe('allowance policy', () => {
  it('computes UTC day boundaries', () => {
    expect(utcDay(new Date('2026-08-24T23:59:59Z'))).toBe('2026-08-24');
    expect(utcDay(new Date('2026-08-25T00:00:00Z'))).toBe('2026-08-25');
  });

  it('three allowances per UTC day, floored at zero', () => {
    expect(allowancesRemaining(0)).toBe(3);
    expect(allowancesRemaining(2)).toBe(1);
    expect(allowancesRemaining(3)).toBe(0);
    expect(allowancesRemaining(7)).toBe(0);
  });
});
