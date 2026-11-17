/**
 * A3 partial — result bot poses for D2 overlay.
 *
 * APPROVED now: kneeling `defeat` (kit-v003; adapter maps MotionPose `defeat`).
 * NOT approved: raised-weapon `victory` art — expose a stable slot id only.
 * Do not claim full A3 done; do not treat kit `poses.victory` as product-ready.
 */

import type { MotionPose } from '../assembler/types';

export type ResultBotPoseKind = 'victory' | 'defeat';

/** Flip to `'approved'` only after UI/UX + Art Supervisor accept raised-weapon victory. */
export const VICTORY_POSE_ART_STATUS = 'slot-pending-raised-weapon' as const;

/** Stable hook id for D2 / future raised-weapon victory wiring. */
export const VICTORY_POSE_SLOT_ID = 'result.victory.raised-weapon' as const;

export type ApprovedDefeatPose = {
  readonly kind: 'defeat';
  readonly status: 'approved';
  readonly motionPose: Extract<MotionPose, 'defeat'>;
};

export type PendingVictoryPoseSlot = {
  readonly kind: 'victory';
  readonly status: typeof VICTORY_POSE_ART_STATUS;
  /** No MotionPose until raised-weapon art is approved. */
  readonly motionPose: null;
  readonly slotId: typeof VICTORY_POSE_SLOT_ID;
};

export type ResolvedResultBotPose = ApprovedDefeatPose | PendingVictoryPoseSlot;

/**
 * Resolve which bot pose D2 should mount on the result overlay.
 * Victory always returns the pending slot until art status flips.
 */
export function resolveResultBotPose(kind: ResultBotPoseKind): ResolvedResultBotPose {
  if (kind === 'defeat') {
    return { kind: 'defeat', status: 'approved', motionPose: 'defeat' };
  }
  return {
    kind: 'victory',
    status: VICTORY_POSE_ART_STATUS,
    motionPose: null,
    slotId: VICTORY_POSE_SLOT_ID,
  };
}

export function isApprovedResultMotionPose(
  resolved: ResolvedResultBotPose,
): resolved is ApprovedDefeatPose {
  return resolved.status === 'approved' && resolved.motionPose !== null;
}
