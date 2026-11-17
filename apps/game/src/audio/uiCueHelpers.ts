/**
 * Headless-safe helpers for Result / Customise UI cues.
 * Never loads or plays audio — only gates + variation math.
 *
 * Triggers (docs / Audio Director INTEGRATION):
 * - newRecord — after win stinger when NEW RECORD stamp lands (not on top of win)
 * - xpTick — each XP bar step; ≤1 per ~60 ms; ±1 semitone / ±2 dB
 * - equip — only after EQUIP succeeds (server confirmed)
 * - select — weapon/part card tap
 */
import type { BattleOutcome } from '@botore/replay';
import type { TrialAudioUiCueId } from './trialAudioPin';

/** Minimum gap between XP tick one-shots (Audio Director). */
export const XP_TICK_MIN_INTERVAL_MS = 60;

/** ±1 semitone → rate multiplier range (2^(±1/12)). */
export const XP_TICK_RATE_MIN = 2 ** (-1 / 12);
export const XP_TICK_RATE_MAX = 2 ** (1 / 12);

/** ±2 dB → linear volume scale (10^(±2/20)). */
export const XP_TICK_VOLUME_SCALE_MIN = 10 ** (-2 / 20);
export const XP_TICK_VOLUME_SCALE_MAX = 10 ** (2 / 20);

export type XpTickGate = {
  /** True when enough time has passed since the last allowed tick. */
  shouldPlay: (nowMs: number) => boolean;
  reset: () => void;
};

/** Throttle XP bar ticks to at most one per {@link XP_TICK_MIN_INTERVAL_MS}. */
export function createXpTickGate(minIntervalMs: number = XP_TICK_MIN_INTERVAL_MS): XpTickGate {
  let lastPlayedAt = Number.NEGATIVE_INFINITY;
  const gap = Math.max(0, minIntervalMs);
  return {
    shouldPlay(nowMs: number) {
      if (!Number.isFinite(nowMs)) return false;
      if (nowMs - lastPlayedAt < gap) return false;
      lastPlayedAt = nowMs;
      return true;
    },
    reset() {
      lastPlayedAt = Number.NEGATIVE_INFINITY;
    },
  };
}

export type XpTickVariation = {
  /** Playback rate multiplier (~0.94–1.06 for ±1 semitone). */
  readonly rate: number;
  /** Volume scale (~0.79–1.26 for ±2 dB). Apply on top of manifest volume. */
  readonly volumeScale: number;
};

/**
 * Per-trigger pitch/volume jitter for XP ticks.
 * `rng01` must return a number in [0, 1); inject a seeded RNG in tests.
 */
export function xpTickVariation(rng01: () => number): XpTickVariation {
  const u = clamp01(rng01());
  const v = clamp01(rng01());
  const rate = XP_TICK_RATE_MIN + (XP_TICK_RATE_MAX - XP_TICK_RATE_MIN) * u;
  const volumeScale =
    XP_TICK_VOLUME_SCALE_MIN + (XP_TICK_VOLUME_SCALE_MAX - XP_TICK_VOLUME_SCALE_MIN) * v;
  return { rate, volumeScale };
}

/**
 * NEW RECORD cue must follow the win stinger, not overlap it.
 * Call when the stamp lands; pass whether win already started and elapsed ms.
 */
export function shouldPlayNewRecordCue(input: {
  readonly isNewRecord: boolean;
  readonly winStarted: boolean;
  readonly msSinceWinStart: number;
  /** Minimum delay after win start before the stamp SFX (default 400 ms). */
  readonly minDelayAfterWinMs?: number;
}): boolean {
  if (!input.isNewRecord || !input.winStarted) return false;
  const minDelay = input.minDelayAfterWinMs ?? 400;
  return input.msSinceWinStart >= minDelay;
}

/** Equip SFX only after a confirmed successful save — never on press. */
export function shouldPlayEquipCue(equipSucceeded: boolean): boolean {
  return equipSucceeded === true;
}

/** True when the attacker (near/player seat) won the sealed outcome. */
export function isAttackerWin(outcome: BattleOutcome, attackerId: string): boolean {
  if (!attackerId) return false;
  if (outcome.reason === 'defeat') return outcome.winner === attackerId;
  return outcome.winnerByTiebreak === attackerId;
}

/**
 * NEW RECORD stamp: attacker win with positive XP (server) or any attacker win
 * on DEV fixtures so the cue is hearable without inventing XP numbers.
 */
export function shouldShowNewRecordStamp(input: {
  readonly outcome: BattleOutcome;
  readonly attackerId: string;
  readonly serverConfirmed: boolean;
  readonly xpAwarded: number | null;
}): boolean {
  if (!isAttackerWin(input.outcome, input.attackerId)) return false;
  if (!input.serverConfirmed) return true;
  return (input.xpAwarded ?? 0) > 0;
}

/** Part / weapon card selection SFX. */
export function shouldPlaySelectCue(cardSelected: boolean): boolean {
  return cardSelected === true;
}

export type UiCuePlayRequest =
  | { readonly id: 'newRecord'; readonly play: boolean }
  | { readonly id: 'xpTick'; readonly play: boolean; readonly variation?: XpTickVariation }
  | { readonly id: 'equip'; readonly play: boolean }
  | { readonly id: 'select'; readonly play: boolean };

export function resolveUiCuePlay(id: TrialAudioUiCueId, allowed: boolean): UiCuePlayRequest | null {
  if (!allowed) return null;
  return { id, play: true };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}
