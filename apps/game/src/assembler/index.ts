/**
 * F7 shared bot assembler — single export surface for shell / F8 / fight.
 *
 * Import `BotAssembler` + types from here. Do not duplicate assembly in screen
 * packages. Pack loading remains F6; this module maps Workshop Frame kit-v002
 * behind the existing props (adapter — not a competing schema).
 */

export { BotAssembler } from './BotAssembler';
export {
  assembleBot,
  provisionalMotionOffset,
  withFacing,
  withPaint,
  withWeapon,
} from './assemble';
export type { AssembleBotInput } from './assemble';
export { isKnownAssemblerPaintId, OXIDE_PAINT, PETROL_PAINT, resolvePaintVisual } from './paints';
export type { PaintVisualSpec } from './paints';
export {
  isKnownAssemblerWeaponId,
  PLACEHOLDER_CANVAS,
  PLACEHOLDER_CHASSIS_ID,
  PLACEHOLDER_GRIP,
  PLACEHOLDER_METAL,
  PLACEHOLDER_WEAPONS,
  resolveWeaponKit,
} from './kit';
export type { WeaponKind, WeaponKitSpec } from './kit';
export {
  ACTIVE_WORKSHOP_FRAME_FAMILY,
  MOTION_POSE_TO_KIT,
  WORKSHOP_FRAME_KIT_ID,
  WORKSHOP_FRAME_MANIFEST,
  assembleWorkshopFrame,
  listWorkshopFrameGaps,
} from './workshopFrameAdapter';
export { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from './workshopFramePin';
export type {
  AssembledBot,
  AssembledLayer,
  AssemblerLayerKind,
  AssemblerLayerRole,
  AssemblerLoadoutInput,
  BotAssemblerProps,
  BotFacing,
  MotionPose,
  ProvisionalPoint,
  SamplePaintVisual,
} from './types';
