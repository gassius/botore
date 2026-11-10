/**
 * Product mapping: sealed combat-v1 attack kinds → shared MotionPose.
 *
 * Decision (C11): **extend MotionPose** (not a parallel event-driven kitPoseKey
 * prop) so Stable / Customise / fight keep one BotAssembler API.
 *
 * Sealed `attack_selected.attack` already distinguishes lighter basic vs full
 * weapon power in combat-v1 — presentation maps those onto kit quick/heavy
 * poses. No new combat mechanics; no invented outcomes.
 */

import type { MotionPose } from './types';

/** Sealed replay / combat-v1 attack kind on `attack_selected`. */
export type SealedAttackKind = 'basic' | 'weapon';

/**
 * Heavy presentation beat within one sealed weapon attack.
 * Compiled into sequential `attack_anim` commands (SFX only on strike).
 */
export type HeavyAttackPhase = 'windup' | 'strike';

/**
 * Map a sealed attack kind (+ optional heavy phase) onto MotionPose.
 * `basic` → quick hit (`attack` → kit `quick_attack`).
 * `weapon` → heavy windup/strike (`heavy_*` → same-named kit keys).
 */
export function motionPoseFromSealedAttack(
  attack: SealedAttackKind,
  heavyPhase: HeavyAttackPhase = 'strike',
): MotionPose {
  if (attack === 'basic') {
    return 'attack';
  }
  return heavyPhase === 'windup' ? 'heavy_windup' : 'heavy_attack';
}

/** True when the MotionPose is one of the kit heavy keys. */
export function isHeavyMotionPose(pose: MotionPose): boolean {
  return pose === 'heavy_windup' || pose === 'heavy_attack';
}

/** All public MotionPose values (Stable / Customise / fight share this set). */
export const MOTION_POSES: readonly MotionPose[] = [
  'idle',
  'attack',
  'heavy_windup',
  'heavy_attack',
  'dodge',
  'hit',
  'defeat',
] as const;

export function isMotionPose(value: unknown): value is MotionPose {
  return typeof value === 'string' && (MOTION_POSES as readonly string[]).includes(value);
}
