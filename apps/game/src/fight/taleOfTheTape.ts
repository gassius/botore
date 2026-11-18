/**
 * D9 Tale of the Tape row builders — real session / capture-fixture stats only.
 * Never invent MOCK HP/Strength art rows.
 */
import {
  resultCaptureRecord,
  type ResultCaptureScenario,
} from '../result-overlay/designCaptureRecords';
import type { BotFightRecordSnapshot } from '../result-overlay/types';

export type TapeRow = { readonly label: string; readonly you: string; readonly them: string };

export function formatTapeRecord(wins: number, losses: number): string {
  return `${wins}W–${losses}L`;
}

export function formatTapeWinStreak(record: BotFightRecordSnapshot): string | null {
  if (typeof record.bestWinStreak === 'number') return String(record.bestWinStreak);
  if (typeof record.streakEndedAt === 'number') return String(record.streakEndedAt);
  return null;
}

export function formatTapeLevel(record: BotFightRecordSnapshot): string | null {
  return typeof record.level === 'number' ? String(record.level) : null;
}

/**
 * Design-capture ConfirmFight stills share Result overlay fixture numbers
 * (victory 13W–6L / streak 3 / level 4) so ToTT matches the same review pack.
 */
export function designCaptureTapeStats(scenario: ResultCaptureScenario = 'victory'): {
  readonly record: string;
  readonly winStreak: string | null;
  readonly level: string | null;
} {
  const snap = resultCaptureRecord(scenario);
  return {
    record: formatTapeRecord(snap.wins, snap.losses),
    winStreak: formatTapeWinStreak(snap),
    level: formatTapeLevel(snap),
  };
}

/**
 * D9 Tale of the Tape — only real session data.
 * Record / Win streak / Level hide when ranking fields are absent.
 */
export function buildTapeRows(input: {
  playerPaint: string;
  playerWeapon: string;
  opponentPaint: string;
  opponentWeapon: string;
  playerRecord?: string | null;
  opponentRecord?: string | null;
  playerWinStreak?: string | null;
  opponentWinStreak?: string | null;
  playerLevel?: string | null;
  opponentLevel?: string | null;
  weaponLabel: (id: string) => string;
  paintLabel: (id: string) => string;
  /** Shared-resolver THEM overrides (e.g. Can Hook → Hook). */
  opponentWeaponLabel?: string | null;
  opponentPaintLabel?: string | null;
}): readonly TapeRow[] {
  const rows: TapeRow[] = [];
  if (input.playerRecord || input.opponentRecord) {
    rows.push({
      label: 'Record',
      you: input.playerRecord ?? '—',
      them: input.opponentRecord ?? '—',
    });
  }
  if (input.playerWinStreak || input.opponentWinStreak) {
    rows.push({
      label: 'Win streak',
      you: input.playerWinStreak ?? '—',
      them: input.opponentWinStreak ?? '—',
    });
  }
  if (input.playerLevel || input.opponentLevel) {
    rows.push({
      label: 'Level',
      you: input.playerLevel ?? '—',
      them: input.opponentLevel ?? '—',
    });
  }
  rows.push({
    label: 'Weapon',
    you: input.weaponLabel(input.playerWeapon),
    them: input.opponentWeaponLabel ?? input.weaponLabel(input.opponentWeapon),
  });
  rows.push({
    label: 'Paint',
    you: input.paintLabel(input.playerPaint),
    them: input.opponentPaintLabel ?? input.paintLabel(input.opponentPaint),
  });
  return rows;
}
