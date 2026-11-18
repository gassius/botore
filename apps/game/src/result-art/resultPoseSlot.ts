/**
 * A3 result bot poses for D2 overlay.
 *
 * On the Fight View stack (kit-v002), victory maps to interim `heavy_windup`
 * until kit-v003.1 MotioPose `victory` lands with A3 (#73). Defeat is approved
 * kneeling `defeat` already present on v002.
 */

import type { MotionPose } from '../assembler/types';

export type ResultBotPoseKind = 'victory' | 'defeat';

/** Stable hook id — D2 may still key layout off this nativeID. */
export const VICTORY_POSE_SLOT_ID = 'result.victory.raised-weapon' as const;

/**
 * Interim on kit-v002 (this stack). Becomes `'approved'` MotioPose `victory`
 * when A3 kit-v003.1 merges onto the Fight View line.
 */
export const VICTORY_POSE_ART_STATUS = 'interim_heavy_windup' as const;

export type ApprovedResultBotPose = {
  readonly kind: ResultBotPoseKind;
  readonly status: 'approved' | 'interim';
  readonly motionPose: Extract<MotionPose, 'heavy_windup' | 'defeat'>;
  /** Present for victory so existing D2 hooks keep a stable id. */
  readonly slotId?: typeof VICTORY_POSE_SLOT_ID;
};

export type ResolvedResultBotPose = ApprovedResultBotPose;

/**
 * Resolve which bot pose D2 should mount on the result overlay.
 */
export function resolveResultBotPose(kind: ResultBotPoseKind): ResolvedResultBotPose {
  if (kind === 'defeat') {
    return { kind: 'defeat', status: 'approved', motionPose: 'defeat' };
  }
  return {
    kind: 'victory',
    status: 'interim',
    motionPose: 'heavy_windup',
    slotId: VICTORY_POSE_SLOT_ID,
  };
}

export function isApprovedResultMotionPose(
  resolved: ResolvedResultBotPose,
): resolved is ApprovedResultBotPose {
  return (
    (resolved.status === 'approved' || resolved.status === 'interim') &&
    resolved.motionPose !== null
  );
}
