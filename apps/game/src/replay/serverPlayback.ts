/**
 * Server-playback readiness for F9 FightSuccess → F10 confirmed result.
 * Headless-safe; no DEV golden / fixture fallback.
 */
import type { FightSuccess } from '../fight/request/types';
import {
  ConfirmedResultIntegrityError,
  confirmedResultFromFightSuccess,
  type ConfirmedFightResult,
} from './confirmedResult';

export type FirstRunResultBlockReason =
  'missing_fight' | 'invalid_replay' | 'missing_sealed_builds';

export type FirstRunResultResolution =
  | { readonly status: 'confirmed'; readonly confirmed: ConfirmedFightResult }
  | {
      readonly status: 'blocked';
      readonly reason: FirstRunResultBlockReason;
      readonly message: string;
    };

/** True when F9 fight payload can drive server-confirmed replay + result UI. */
export function isServerPlaybackReady(fight: FightSuccess | null | undefined): boolean {
  return tryConfirmedResultFromFight(fight) !== null;
}

/**
 * Map a FightSuccess to ConfirmedFightResult without fixture fallback.
 * Returns null when envelope/sealed builds cannot be verified.
 */
export function tryConfirmedResultFromFight(
  fight: FightSuccess | null | undefined,
): ConfirmedFightResult | null {
  if (!fight) return null;
  if (!fight.sealedBuilds) return null;
  try {
    return confirmedResultFromFightSuccess(fight);
  } catch (err) {
    if (err instanceof ConfirmedResultIntegrityError) return null;
    // validateReplay / verifyReplay failures also mean not server-playback-ready
    return null;
  }
}

/**
 * First-run Replay / Result: backend fight only.
 * Never invents XP or substitutes a different robot from DEV golden.
 */
export function resolveFirstRunConfirmedResult(
  lastFight: FightSuccess | null | undefined,
): FirstRunResultResolution {
  if (!lastFight) {
    return {
      status: 'blocked',
      reason: 'missing_fight',
      message:
        'Start a fight from Confirm so Replay and Result use the server-precomputed battle. Fixture replays are not used on the first-run path.',
    };
  }
  if (!lastFight.sealedBuilds) {
    return {
      status: 'blocked',
      reason: 'missing_sealed_builds',
      message:
        'Server fight is missing sealed builds for the garage loadout. Same-robot playback cannot proceed.',
    };
  }
  const confirmed = tryConfirmedResultFromFight(lastFight);
  if (!confirmed) {
    return {
      status: 'blocked',
      reason: 'invalid_replay',
      message:
        'Fight response did not include a sealed combat-v1 replay. Live Supabase combat-v1 is required — DEV scaffold is not first-run playback.',
    };
  }
  return { status: 'confirmed', confirmed };
}
