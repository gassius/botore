/**
 * Pure bot assembly: loadout → ordered layers (stable / preview / fight).
 *
 * Dispatches to Workshop Frame kit-v001 when `placeholder` is false; otherwise
 * geometric PLACEHOLDER stand-ins. Framework-free core stays in
 * `workshopFrameAdapter` / this file for headless tests.
 */

import {
  PLACEHOLDER_CANVAS,
  PLACEHOLDER_CHASSIS_ID,
  PLACEHOLDER_GRIP,
  PLACEHOLDER_METAL,
  resolveWeaponKit,
} from './kit';
import { resolvePaintVisual } from './paints';
import type {
  AssembledBot,
  AssembledLayer,
  AssemblerLoadoutInput,
  BotFacing,
  MotionPose,
} from './types';
import { assembleWorkshopFrame } from './workshopFrameAdapter';

export interface AssembleBotInput {
  readonly loadout: AssemblerLoadoutInput;
  readonly facing: BotFacing;
  readonly paintId?: string;
  readonly weaponId?: string;
  readonly motionPose?: MotionPose;
  /**
   * true → geometric PLACEHOLDER; false/undefined → kit-v001 when available.
   * Setting false is local integration only — not likeness/native acceptance.
   */
  readonly placeholder?: boolean;
}

function metalLayers(): AssembledLayer[] {
  const m = PLACEHOLDER_METAL;
  return [
    {
      id: 'ph-shadow',
      role: 'shadow',
      kind: 'fx',
      zIndex: 0,
      x: 28,
      y: 148,
      width: 64,
      height: 10,
      color: m.shadow,
      isPaintMask: false,
      label: 'PLACEHOLDER shadow',
    },
    {
      id: 'ph-leg-l',
      role: 'leg-back',
      kind: 'metal',
      zIndex: 1,
      x: 40,
      y: 108,
      width: 16,
      height: 40,
      color: m.frame,
      isPaintMask: false,
      label: 'PLACEHOLDER leg',
    },
    {
      id: 'ph-leg-r',
      role: 'leg-back',
      kind: 'metal',
      zIndex: 2,
      x: 64,
      y: 108,
      width: 16,
      height: 40,
      color: m.frame,
      isPaintMask: false,
      label: 'PLACEHOLDER leg',
    },
    {
      id: 'ph-torso-metal',
      role: 'torso',
      kind: 'metal',
      zIndex: 3,
      x: 38,
      y: 58,
      width: 44,
      height: 52,
      color: m.plate,
      isPaintMask: false,
      label: 'PLACEHOLDER torso metal',
    },
    {
      id: 'ph-arm-back',
      role: 'arm-back',
      kind: 'metal',
      zIndex: 4,
      x: 22,
      y: 62,
      width: 18,
      height: 42,
      color: m.frame,
      isPaintMask: false,
      label: 'PLACEHOLDER arm',
    },
    {
      id: 'ph-head-metal',
      role: 'head',
      kind: 'metal',
      zIndex: 5,
      x: 42,
      y: 18,
      width: 36,
      height: 36,
      color: m.plate,
      isPaintMask: false,
      label: 'PLACEHOLDER head metal',
    },
    {
      id: 'ph-eye-l',
      role: 'head',
      kind: 'metal',
      zIndex: 7,
      x: 50,
      y: 30,
      width: 6,
      height: 14,
      color: m.eye,
      isPaintMask: false,
      label: 'PLACEHOLDER eye',
    },
    {
      id: 'ph-eye-r',
      role: 'head',
      kind: 'metal',
      zIndex: 8,
      x: 64,
      y: 30,
      width: 6,
      height: 14,
      color: m.eye,
      isPaintMask: false,
      label: 'PLACEHOLDER eye',
    },
    {
      id: 'ph-arm-front',
      role: 'arm-front',
      kind: 'metal',
      zIndex: 9,
      x: 80,
      y: 62,
      width: 18,
      height: 42,
      color: m.frame,
      isPaintMask: false,
      label: 'PLACEHOLDER arm',
    },
    {
      id: 'ph-hand',
      role: 'hand',
      kind: 'metal',
      zIndex: 10,
      x: 82,
      y: 98,
      width: 16,
      height: 14,
      color: m.joint,
      isPaintMask: false,
      label: 'PLACEHOLDER hand',
    },
  ];
}

function paintMaskLayers(armourColor: string): AssembledLayer[] {
  return [
    {
      id: 'ph-paint-torso',
      role: 'paint-mask',
      kind: 'paint',
      zIndex: 6,
      x: 42,
      y: 62,
      width: 36,
      height: 28,
      color: armourColor,
      isPaintMask: true,
      label: 'PLACEHOLDER paint mask torso',
    },
    {
      id: 'ph-paint-head',
      role: 'paint-mask',
      kind: 'paint',
      zIndex: 6,
      x: 46,
      y: 22,
      width: 28,
      height: 16,
      color: armourColor,
      isPaintMask: true,
      label: 'PLACEHOLDER paint mask head',
    },
    {
      id: 'ph-paint-boot-l',
      role: 'paint-mask',
      kind: 'paint',
      zIndex: 6,
      x: 38,
      y: 138,
      width: 20,
      height: 10,
      color: armourColor,
      isPaintMask: true,
      label: 'PLACEHOLDER paint mask boot',
    },
    {
      id: 'ph-paint-boot-r',
      role: 'paint-mask',
      kind: 'paint',
      zIndex: 6,
      x: 62,
      y: 138,
      width: 20,
      height: 10,
      color: armourColor,
      isPaintMask: true,
      label: 'PLACEHOLDER paint mask boot',
    },
  ];
}

function assemblePlaceholder(input: AssembleBotInput): AssembledBot {
  const paintId = input.paintId ?? input.loadout.paint;
  const weaponId = input.weaponId ?? input.loadout.weapon;
  const paint = resolvePaintVisual(paintId);
  const weapon = resolveWeaponKit(weaponId);
  const facing = input.facing;
  const motionPose = input.motionPose ?? 'idle';
  const mirrored = facing === 'left';

  const gripX = PLACEHOLDER_GRIP.x;
  const gripY = PLACEHOLDER_GRIP.y;
  const weaponLayer: AssembledLayer = {
    id: `ph-weapon-${weapon.kind}`,
    role: 'weapon',
    kind: 'weapon',
    zIndex: 11,
    x: gripX + weapon.gripOffset.x,
    y: gripY + weapon.gripOffset.y,
    width: weapon.width,
    height: weapon.height,
    color: weapon.color,
    isPaintMask: false,
    attachTo: 'hand',
    attachOffset: weapon.gripOffset,
    label: `PLACEHOLDER ${weapon.label}`,
  };

  const labelLayer: AssembledLayer = {
    id: 'ph-kit-label',
    role: 'label',
    kind: 'meta',
    zIndex: 12,
    x: 8,
    y: 2,
    width: 104,
    height: 12,
    color: PLACEHOLDER_METAL.outline,
    isPaintMask: false,
    label: 'PLACEHOLDER Workshop Frame',
  };

  const layers = [
    ...metalLayers(),
    ...paintMaskLayers(paint.armourColor),
    weaponLayer,
    labelLayer,
  ].sort((a, b) => a.zIndex - b.zIndex);

  return {
    atlasVersion: 'v1',
    chassisId: input.loadout.chassis || PLACEHOLDER_CHASSIS_ID,
    paintId: paint.cataloguePaintId,
    paintVisual: paint.visual,
    weaponId: weapon.catalogueId,
    weaponKind: weapon.kind,
    facing,
    mirrored,
    motionPose,
    placeholder: true,
    canvas: PLACEHOLDER_CANVAS,
    grip: PLACEHOLDER_GRIP,
    layers,
  };
}

/**
 * Assemble a bot from loadout + facing. Same pure function for stable,
 * customisation preview, and fight — consumers only change props.
 */
export function assembleBot(input: AssembleBotInput): AssembledBot {
  if (input.placeholder === true) {
    return assemblePlaceholder(input);
  }
  return assembleWorkshopFrame({
    loadout: input.loadout,
    facing: input.facing,
    ...(input.paintId !== undefined ? { paintId: input.paintId } : {}),
    ...(input.weaponId !== undefined ? { weaponId: input.weaponId } : {}),
    ...(input.motionPose !== undefined ? { motionPose: input.motionPose } : {}),
  });
}

/** Swap helpers used by tests and preview overrides. */
export function withPaint(bot: AssembledBot, paintId: string): AssembledBot {
  return assembleBot({
    loadout: { chassis: bot.chassisId, paint: paintId, weapon: bot.weaponId },
    facing: bot.facing,
    motionPose: bot.motionPose,
    placeholder: bot.placeholder,
  });
}

export function withWeapon(bot: AssembledBot, weaponId: string): AssembledBot {
  return assembleBot({
    loadout: { chassis: bot.chassisId, paint: bot.paintId, weapon: weaponId },
    facing: bot.facing,
    motionPose: bot.motionPose,
    placeholder: bot.placeholder,
  });
}

export function withFacing(bot: AssembledBot, facing: BotFacing): AssembledBot {
  return assembleBot({
    loadout: { chassis: bot.chassisId, paint: bot.paintId, weapon: bot.weaponId },
    facing,
    motionPose: bot.motionPose,
    placeholder: bot.placeholder,
  });
}

/** PROVISIONAL motion offsets for PLACEHOLDER stand-ins only. */
export function provisionalMotionOffset(
  pose: MotionPose,
  reducedMotion: boolean,
): { translateX: number; translateY: number; rotateDeg: number; provisional: true } {
  if (reducedMotion || pose === 'idle') {
    return { translateX: 0, translateY: 0, rotateDeg: 0, provisional: true };
  }
  switch (pose) {
    case 'attack':
      return { translateX: 10, translateY: -2, rotateDeg: -6, provisional: true };
    case 'dodge':
      return { translateX: -8, translateY: -4, rotateDeg: 4, provisional: true };
    case 'hit':
      return { translateX: -6, translateY: 2, rotateDeg: 8, provisional: true };
    case 'defeat':
      return { translateX: -4, translateY: 12, rotateDeg: 18, provisional: true };
    default:
      return { translateX: 0, translateY: 0, rotateDeg: 0, provisional: true };
  }
}
