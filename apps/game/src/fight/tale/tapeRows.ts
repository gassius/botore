import { paintDisplayLabel, weaponDisplayLabel } from '../../garage/loadout/proofCatalogue';

/**
 * D9 Tale of the Tape rows — only real data.
 * Never invent Record / Win streak / Level / A6-art MOCK HP/Strength rows.
 * Hide a row when either side lacks a value (D9 acceptance).
 */

export type TapeSideStats = {
  readonly recordWins?: number | null;
  readonly recordLosses?: number | null;
  readonly winStreak?: number | null;
  readonly level?: number | null;
  readonly weaponId?: string | null;
  readonly paintId?: string | null;
};

export type TapeRow = {
  readonly key: 'record' | 'win_streak' | 'level' | 'weapon' | 'paint';
  readonly label: string;
  readonly left: string;
  readonly right: string;
  /** Which side is better for comparable numeric rows; null = tie / N/A. */
  readonly better: 'left' | 'right' | null;
};

function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

function recordScore(wins: number, losses: number): number {
  const total = wins + losses;
  if (total <= 0) return wins;
  return wins / total;
}

/** Build D9 tape rows from real sides only — omit incomplete rows. */
export function buildTaleOfTheTapeRows(
  player: TapeSideStats,
  opponent: TapeSideStats,
): readonly TapeRow[] {
  const rows: TapeRow[] = [];

  const pW = player.recordWins;
  const pL = player.recordLosses;
  const oW = opponent.recordWins;
  const oL = opponent.recordLosses;
  if (
    typeof pW === 'number' &&
    typeof pL === 'number' &&
    typeof oW === 'number' &&
    typeof oL === 'number'
  ) {
    const leftScore = recordScore(pW, pL);
    const rightScore = recordScore(oW, oL);
    rows.push({
      key: 'record',
      label: 'Record',
      left: formatRecord(pW, pL),
      right: formatRecord(oW, oL),
      better: leftScore === rightScore ? null : leftScore > rightScore ? 'left' : 'right',
    });
  }

  if (typeof player.winStreak === 'number' && typeof opponent.winStreak === 'number') {
    rows.push({
      key: 'win_streak',
      label: 'Win streak',
      left: String(player.winStreak),
      right: String(opponent.winStreak),
      better:
        player.winStreak === opponent.winStreak
          ? null
          : player.winStreak > opponent.winStreak
            ? 'left'
            : 'right',
    });
  }

  if (typeof player.level === 'number' && typeof opponent.level === 'number') {
    rows.push({
      key: 'level',
      label: 'Level',
      left: String(player.level),
      right: String(opponent.level),
      better:
        player.level === opponent.level ? null : player.level > opponent.level ? 'left' : 'right',
    });
  }

  if (player.weaponId && opponent.weaponId) {
    rows.push({
      key: 'weapon',
      label: 'Weapon',
      left: weaponDisplayLabel(player.weaponId),
      right: weaponDisplayLabel(opponent.weaponId),
      better: null,
    });
  }

  if (player.paintId && opponent.paintId) {
    rows.push({
      key: 'paint',
      label: 'Paint',
      left: paintDisplayLabel(player.paintId),
      right: paintDisplayLabel(opponent.paintId),
      better: null,
    });
  }

  return rows;
}
