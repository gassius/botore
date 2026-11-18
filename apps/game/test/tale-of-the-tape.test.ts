import { describe, expect, it } from 'vitest';
import {
  buildTapeRows,
  designCaptureTapeStats,
  formatTapeRecord,
} from '../src/fight/taleOfTheTape';

describe('tale of the tape (D9)', () => {
  it('formats W–L like Result overlay review numbers', () => {
    expect(formatTapeRecord(13, 6)).toBe('13W–6L');
  });

  it('design-capture victory fixtures match Result stills', () => {
    const you = designCaptureTapeStats('victory');
    expect(you.record).toBe('13W–6L');
    expect(you.winStreak).toBe('3');
    expect(you.level).toBe('4');
    const them = designCaptureTapeStats('defeat');
    expect(them.record).toBe('11W–7L');
    expect(them.winStreak).toBe('3');
    expect(them.level).toBe('4');
  });

  it('includes Record / Win streak / Level when present; never MOCK rows', () => {
    const rows = buildTapeRows({
      playerPaint: 'paint-hazard',
      playerWeapon: 'weapon-mace',
      opponentPaint: 'paint-navy',
      opponentWeapon: 'weapon-sword',
      playerRecord: '13W–6L',
      opponentRecord: '11W–7L',
      playerWinStreak: '3',
      opponentWinStreak: '3',
      playerLevel: '4',
      opponentLevel: '4',
      weaponLabel: (id) => id.replace('weapon-', ''),
      paintLabel: (id) => id.replace('paint-', ''),
    });
    expect(rows.map((r) => r.label)).toEqual(['Record', 'Win streak', 'Level', 'Weapon', 'Paint']);
    expect(rows.some((r) => /mock/i.test(r.label) || /mock/i.test(r.you))).toBe(false);
  });

  it('hides ranking rows when absent (live path without join)', () => {
    const rows = buildTapeRows({
      playerPaint: 'paint-crimson',
      playerWeapon: 'weapon-sword',
      opponentPaint: 'paint-cobalt',
      opponentWeapon: 'weapon-axe',
      weaponLabel: (id) => id,
      paintLabel: (id) => id,
    });
    expect(rows.map((r) => r.label)).toEqual(['Weapon', 'Paint']);
  });
});
