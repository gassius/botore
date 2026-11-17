/**
 * A3 (kit-v003.1) — result bot poses for D2 overlay.
 *
 * APPROVED: overhead raised-weapon `victory` (all three weapons; axe one-handed)
 * and kneeling `defeat` (fixed feet/knees). Both map onto MotionPose.
 */

import type { MotionPose } from '../assembler/types';

export type ResultBotPoseKind = 'victory' | 'defeat';

/** Stable hook id — D2 may still key layout off this nativeID. */
export const VICTORY_POSE_SLOT_ID = 'result.victory.raised-weapon' as const;

export const VICTORY_POSE_ART_STATUS = 'approved' as const;

export type ApprovedResultBotPose = {
  readonly kind: ResultBotPoseKind;
  readonly status: 'approved';
  readonly motionPose: Extract<MotionPose, 'victory' | 'defeat'>;
  /** Present for victory so existing D2 hooks keep a stable id. */
  readonly slotId?: typeof VICTORY_POSE_SLOT_ID;
};

/** @deprecated Pending victory slot removed — A3 victory is approved on kit-v003.1. */
export type PendingVictoryPoseSlot = never;

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
    status: 'approved',
    motionPose: 'victory',
    slotId: VICTORY_POSE_SLOT_ID,
  };
}

export function isApprovedResultMotionPose(
  resolved: ResolvedResultBotPose,
): resolved is ApprovedResultBotPose {
  return resolved.status === 'approved' && resolved.motionPose !== null;
}
