/**
 * Pure Result overlay card builders — no RN, no IDs in player-facing strings.
 */
import { isAttackerWin, shouldShowNewRecordStamp } from '../audio/uiCueHelpers';
import { fighterDisplayName } from '../replay/confirmedResult';
import type { ConfirmedFightResult } from '../replay/confirmedResult';
import type { BotFightRecordSnapshot, ResultCardModel, ResultOverlayOutcomeKind } from './types';

export function resolveOutcomeKind(confirmed: ConfirmedFightResult): ResultOverlayOutcomeKind {
  const fighters = confirmed.replay.fighters;
  const attackerId = fighters[0]?.characterId ?? '';
  if (!attackerId) return 'draw';
  const winnerId =
    confirmed.outcome.reason === 'defeat'
      ? confirmed.outcome.winner
      : confirmed.outcome.winnerByTiebreak;
  if (!winnerId) return 'draw';
  return isAttackerWin(confirmed.outcome, attackerId) ? 'victory' : 'defeat';
}

export function formatRecordLine(wins: number, losses: number): string {
  return `Record  ${wins}W – ${losses}L`;
}

export function formatResultContextLine(
  outcomeKind: ResultOverlayOutcomeKind,
  record: BotFightRecordSnapshot | null | undefined,
): string | null {
  if (!record) return null;
  if (outcomeKind === 'victory' && typeof record.bestWinStreak === 'number') {
    return `Best win streak: ${record.bestWinStreak}`;
  }
  if (outcomeKind === 'defeat' && typeof record.streakEndedAt === 'number') {
    return `Streak ended at ${record.streakEndedAt}`;
  }
  return null;
}

export function formatVsLine(opponentBotName: string, opponentBotoreName: string | null): string {
  if (opponentBotoreName && opponentBotoreName.trim().length > 0) {
    return `vs ${opponentBotName} · ${opponentBotoreName.trim()}`;
  }
  return `vs ${opponentBotName}`;
}

/**
 * Build the player-facing result card from a confirmed fight + optional E2 record.
 * Never invents W–L, level, or streak when the server/fixture omits them.
 */
export function buildResultCardModel(
  confirmed: ConfirmedFightResult,
  options: {
    readonly record?: BotFightRecordSnapshot | null;
    readonly opponentBotoreName?: string | null;
  } = {},
): ResultCardModel {
  const fighters = confirmed.replay.fighters;
  const outcomeKind = resolveOutcomeKind(confirmed);
  const xpAwarded =
    confirmed.serverConfirmed && typeof confirmed.xpAwarded === 'number'
      ? Math.max(0, confirmed.xpAwarded)
      : 0;
  const record = options.record ?? null;
  const opponentBotName = fighterDisplayName(fighters[1]?.characterId, fighters);
  const opponentBotoreName =
    typeof options.opponentBotoreName === 'string' && options.opponentBotoreName.trim().length > 0
      ? options.opponentBotoreName.trim()
      : null;

  const oldRatio = typeof record?.xpBarOldRatio === 'number' ? clamp01(record.xpBarOldRatio) : 0;
  const newRatio =
    typeof record?.xpBarNewRatio === 'number'
      ? clamp01(record.xpBarNewRatio)
      : xpAwarded > 0
        ? 1
        : oldRatio;

  return {
    outcomeKind,
    xpAwarded,
    levelLabel: typeof record?.level === 'number' ? `Level ${record.level}` : null,
    xpBarOldRatio: oldRatio,
    xpBarNewRatio: Math.max(oldRatio, newRatio),
    wins: typeof record?.wins === 'number' ? record.wins : null,
    losses: typeof record?.losses === 'number' ? record.losses : null,
    contextLine: formatResultContextLine(outcomeKind, record),
    showNewRecord: shouldShowNewRecordStamp({ serverNewRecord: confirmed.newRecord }),
    opponentBotName,
    opponentBotoreName,
    vsLine: formatVsLine(opponentBotName, opponentBotoreName),
  };
}

/** Map an E2 `list_bot_ranking` current-bot row into a snapshot (wins/losses/XP only). */
export function botFightRecordFromRankingRow(row: {
  readonly wins?: unknown;
  readonly losses?: unknown;
  readonly totalXp?: unknown;
}): BotFightRecordSnapshot | null {
  if (typeof row.wins !== 'number' || typeof row.losses !== 'number') return null;
  if (!Number.isFinite(row.wins) || !Number.isFinite(row.losses)) return null;
  const snap: BotFightRecordSnapshot = {
    wins: Math.max(0, Math.floor(row.wins)),
    losses: Math.max(0, Math.floor(row.losses)),
  };
  if (typeof row.totalXp === 'number' && Number.isFinite(row.totalXp)) {
    return { ...snap, totalXp: Math.max(0, Math.floor(row.totalXp)) };
  }
  return snap;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}
