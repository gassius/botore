import { describe, expect, it } from 'vitest';
import { buildTaleOfTheTapeRows } from '../src/fight/tale/tapeRows';

describe('D9 tape rows (real data only)', () => {
  it('emits Weapon + Paint from loadouts and omits inventable Record/Level', () => {
    const rows = buildTaleOfTheTapeRows(
      { weaponId: 'weapon-axe', paintId: 'paint-cobalt' },
      { weaponId: 'weapon-sword', paintId: 'paint-crimson' },
    );
    expect(rows.map((r) => r.key)).toEqual(['weapon', 'paint']);
    expect(rows.find((r) => r.key === 'weapon')).toMatchObject({
      left: 'Axe',
      right: 'Sword',
    });
    expect(rows.find((r) => r.key === 'paint')).toMatchObject({
      left: 'Petrol',
      right: 'Oxide',
    });
  });

  it('includes Record only when both sides have real W–L', () => {
    const rows = buildTaleOfTheTapeRows(
      { weaponId: 'weapon-axe', paintId: 'paint-cobalt', recordWins: 12, recordLosses: 6 },
      { weaponId: 'weapon-sword', paintId: 'paint-crimson', recordWins: 16, recordLosses: 4 },
    );
    expect(rows.map((r) => r.key)).toEqual(['record', 'weapon', 'paint']);
    expect(rows[0]).toMatchObject({ left: '12–6', right: '16–4', better: 'right' });
  });

  it('never invents rows from partial stats (A6 art MOCK blocker)', () => {
    const rows = buildTaleOfTheTapeRows(
      { recordWins: 12, recordLosses: 6 },
      { weaponId: 'weapon-sword', paintId: 'paint-crimson' },
    );
    // Record incomplete (opponent missing W–L); weapon/paint incomplete (player missing).
    expect(rows).toEqual([]);
  });
});
