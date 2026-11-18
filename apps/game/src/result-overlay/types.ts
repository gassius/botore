/**
 * D2 Result overlay — player-POV card model (no IDs / checksums / server-debug).
 */

/** E2-shaped bot fight record when ranking W–L is available. */
export type BotFightRecordSnapshot = {
  readonly wins: number;
  readonly losses: number;
  /** Optional total XP for level/bar helpers when the server provides it. */
  readonly totalXp?: number;
  /**
   * Optional streak context from a future server signal.
   * Do not invent streaks client-side from W–L alone.
   */
  readonly bestWinStreak?: number;
  readonly streakEndedAt?: number;
  /** Optional level label when the server provides one — never invent. */
  readonly level?: number;
  /** Level-bar ratios 0..1 before / after this fight's XP (server or capture fixture). */
  readonly xpBarOldRatio?: number;
  readonly xpBarNewRatio?: number;
};

export type ResultOverlayOutcomeKind = 'victory' | 'defeat' | 'draw';

export type ResultCardModel = {
  readonly outcomeKind: ResultOverlayOutcomeKind;
  readonly xpAwarded: number;
  readonly levelLabel: string | null;
  readonly xpBarOldRatio: number;
  readonly xpBarNewRatio: number;
  readonly wins: number | null;
  readonly losses: number | null;
  readonly contextLine: string | null;
  readonly showNewRecord: boolean;
  readonly opponentBotName: string;
  readonly opponentBotoreName: string | null;
  readonly vsLine: string;
};

/** Dim opacity over the frozen arena (mockup ~80–85%). */
export const RESULT_OVERLAY_DIM_OPACITY = 0.82;

/** Plate drop-in duration when motion is allowed. */
export const RESULT_PLATE_DROP_MS = 420;
