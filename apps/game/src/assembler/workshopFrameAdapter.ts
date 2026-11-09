/**
 * Adapter: Workshop Frame kit media schema → existing BotAssembler props/model.
 *
 * ACTIVE PIN: kit-v002 (coherent manifest + parts + provenance). v001 removed
 * from the tree — NEVER load stale v001 coordinates against v002 assets.
 *
 * Does NOT invent a parallel public component API. Maps kit paint/weapon/pose
 * ids onto F7 `assembleBot` / `BotAssemblerProps`. Catalogue ids stay
 * paint-crimson / paint-cobalt / weapon-* (no catalogue expansion).
 */

import kitManifestJson from '../../assets/workshop-frame-kit-v002/manifest.json';
import { ACTIVE_WORKSHOP_FRAME_ASSET_VERSION } from './workshopFramePin';
import {
  childLocalMatrix,
  decomposeTranslateRotate,
  identity,
  multiply,
  rotateCwDeg,
  transformPoint,
  translate,
  type Mat3,
} from './kitMath';
import { resolvePaintVisual } from './paints';
import { resolveWeaponKit } from './kit';
import type {
  AssembledBot,
  AssembledLayer,
  AssemblerLoadoutInput,
  BotFacing,
  MotionPose,
} from './types';
import type {
  KitAsset,
  KitPaintId,
  KitPoseDeltas,
  WorkshopFrameManifest,
} from './workshopFrameTypes';

export const WORKSHOP_FRAME_MANIFEST = kitManifestJson as unknown as WorkshopFrameManifest;

if (WORKSHOP_FRAME_MANIFEST.version !== ACTIVE_WORKSHOP_FRAME_ASSET_VERSION) {
  throw new Error(
    `Workshop Frame version mismatch: manifest=${WORKSHOP_FRAME_MANIFEST.version} assets=${ACTIVE_WORKSHOP_FRAME_ASSET_VERSION}`,
  );
}

export const WORKSHOP_FRAME_KIT_ID = `${WORKSHOP_FRAME_MANIFEST.kit_id}-${WORKSHOP_FRAME_MANIFEST.version}`;
export const ACTIVE_WORKSHOP_FRAME_FAMILY = `workshop-frame-${WORKSHOP_FRAME_MANIFEST.version}`;

/** F7 MotionPose → kit pose key (sketch motion; not combat-event authority). */
export const MOTION_POSE_TO_KIT: Readonly<Record<MotionPose, string>> = {
  idle: 'idle',
  attack: 'quick_attack',
  dodge: 'dodge',
  hit: 'hit',
  defeat: 'defeat',
};

const ROBOT_PART_IDS = [
  'torso',
  'head',
  'pelvis',
  'upper_arm_l',
  'forearm_l',
  'hand_l',
  'thigh_l',
  'shin_l',
  'foot_l',
  'upper_arm_r',
  'forearm_r',
  'hand_r',
  'thigh_r',
  'shin_r',
  'foot_r',
] as const;

function assetMap(manifest: WorkshopFrameManifest): Map<string, KitAsset> {
  return new Map(manifest.assets.map((a) => [a.id, a]));
}

function poseDeltaFor(pose: KitPoseDeltas, assetId: string): number {
  const v = pose[assetId];
  return typeof v === 'number' ? v : 0;
}

function resolveKitPaint(paintId: string): KitPaintId {
  return resolvePaintVisual(paintId).visual;
}

function resolveKitWeaponAssetId(weaponId: string): string {
  const kind = resolveWeaponKit(weaponId).kind;
  return WORKSHOP_FRAME_MANIFEST.integration.weapon_assets[kind] ?? `weapon_${kind}`;
}

/**
 * Build world matrices for the robot hierarchy + selected weapon.
 * Weapon mounts to hand_r.grip with +weapon_grip_rotation_degrees (180).
 */
export function buildWorkshopFrameWorldMatrices(
  paintId: string,
  weaponId: string,
  motionPose: MotionPose,
): {
  paint: KitPaintId;
  weaponAssetId: string;
  kitPoseKey: string;
  matrices: Map<string, Mat3>;
  anglesCw: Map<string, number>;
} {
  const manifest = WORKSHOP_FRAME_MANIFEST;
  const assets = assetMap(manifest);
  const paint = resolveKitPaint(paintId);
  const weaponAssetId = resolveKitWeaponAssetId(weaponId);
  const kitPoseKey = MOTION_POSE_TO_KIT[motionPose] ?? 'idle';
  const pose = manifest.poses[kitPoseKey] ?? {};

  const matrices = new Map<string, Mat3>();
  const anglesCw = new Map<string, number>();

  const torso = assets.get('torso');
  if (!torso) {
    throw new Error(`${ACTIVE_WORKSHOP_FRAME_FAMILY} missing torso`);
  }

  const rootAngle = (pose.root_angle ?? 0) + torso.angle;
  const rootX = manifest.root.position[0] + (pose.root_x ?? 0);
  const rootY = manifest.root.position[1] + (pose.root_y ?? 0);
  const torsoM = multiply(
    multiply(translate(rootX, rootY), rotateCwDeg(rootAngle)),
    translate(-torso.pivot[0], -torso.pivot[1]),
  );
  matrices.set('torso', torsoM);
  anglesCw.set('torso', rootAngle);

  const pending = ROBOT_PART_IDS.filter((id) => id !== 'torso');
  let guard = 0;
  while (pending.length > 0 && guard < 64) {
    guard += 1;
    let progressed = false;
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const id = pending[i]!;
      const asset = assets.get(id);
      if (!asset || !asset.parent || !asset.parent_socket) continue;
      const parentM = matrices.get(asset.parent);
      const parentAsset = assets.get(asset.parent);
      if (!parentM || !parentAsset) continue;
      const socket = parentAsset.sockets[asset.parent_socket];
      if (!socket) continue;
      const angle = asset.angle + poseDeltaFor(pose, id);
      const local = childLocalMatrix(socket[0], socket[1], angle, asset.pivot[0], asset.pivot[1]);
      const world = multiply(parentM, local);
      matrices.set(id, world);
      // Accumulated CW angle ≈ parent + local (valid for pure rotate+translate chain).
      anglesCw.set(id, (anglesCw.get(asset.parent) ?? 0) + angle);
      pending.splice(i, 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  const handM = matrices.get('hand_r');
  const hand = assets.get('hand_r');
  const weapon = assets.get(weaponAssetId);
  if (handM && hand && weapon) {
    const grip = hand.sockets.grip ?? ([60, 61.6] as const);
    const gripRot = manifest.weapon_grip_rotation_degrees;
    const angle = weapon.angle + gripRot + poseDeltaFor(pose, weaponAssetId);
    const local = childLocalMatrix(grip[0], grip[1], angle, weapon.pivot[0], weapon.pivot[1]);
    matrices.set(weaponAssetId, multiply(handM, local));
    anglesCw.set(weaponAssetId, (anglesCw.get('hand_r') ?? 0) + angle);
  }

  return { paint, weaponAssetId, kitPoseKey, matrices, anglesCw };
}

function layerFromAsset(
  asset: KitAsset,
  paint: KitPaintId,
  matrix: Mat3,
  rotateCw: number,
): AssembledLayer {
  const topLeft = transformPoint(matrix, 0, 0);
  const pivotWorld = transformPoint(matrix, asset.pivot[0], asset.pivot[1]);
  const decomp = decomposeTranslateRotate(matrix);
  return {
    id: asset.id,
    role: asset.id.startsWith('weapon_')
      ? 'weapon'
      : asset.id === 'head'
        ? 'head'
        : asset.id === 'torso'
          ? 'torso'
          : asset.id.startsWith('hand')
            ? 'hand'
            : 'torso',
    kind: asset.id.startsWith('weapon_') ? 'weapon' : asset.has_paint ? 'paint' : 'metal',
    zIndex: asset.z,
    x: topLeft.x,
    y: topLeft.y,
    width: asset.width,
    height: asset.height,
    color: WORKSHOP_FRAME_MANIFEST.paint_tokens[paint],
    isPaintMask: asset.has_paint,
    label: `${WORKSHOP_FRAME_KIT_ID}:${asset.id}`,
    imagePath: asset.files[paint],
    pivotX: asset.pivot[0],
    pivotY: asset.pivot[1],
    worldPivotX: pivotWorld.x,
    worldPivotY: pivotWorld.y,
    rotateCwDeg: rotateCw,
    // decomp.x/y is translation of local origin under pure TR — keep for debug
    attachOffset: { x: decomp.x, y: decomp.y, provisional: true },
  };
}

export interface AssembleWorkshopFrameInput {
  readonly loadout: AssemblerLoadoutInput;
  readonly facing: BotFacing;
  readonly paintId?: string;
  readonly weaponId?: string;
  readonly motionPose?: MotionPose;
}

/** Assemble using measured kit-v002 geometry + precomposited Oxide/Petrol PNGs. */
export function assembleWorkshopFrame(input: AssembleWorkshopFrameInput): AssembledBot {
  const paintId = input.paintId ?? input.loadout.paint;
  const weaponId = input.weaponId ?? input.loadout.weapon;
  const motionPose = input.motionPose ?? 'idle';
  const facing = input.facing;
  const paintVisual = resolvePaintVisual(paintId);
  const weapon = resolveWeaponKit(weaponId);

  const { paint, weaponAssetId, matrices, anglesCw } = buildWorkshopFrameWorldMatrices(
    paintId,
    weaponId,
    motionPose,
  );

  const assets = assetMap(WORKSHOP_FRAME_MANIFEST);
  const layers: AssembledLayer[] = [];

  for (const id of ROBOT_PART_IDS) {
    const asset = assets.get(id);
    const matrix = matrices.get(id);
    if (!asset || !matrix) continue;
    layers.push(layerFromAsset(asset, paint, matrix, anglesCw.get(id) ?? 0));
  }

  const weaponAsset = assets.get(weaponAssetId);
  const weaponMatrix = matrices.get(weaponAssetId);
  if (weaponAsset && weaponMatrix) {
    layers.push(layerFromAsset(weaponAsset, paint, weaponMatrix, anglesCw.get(weaponAssetId) ?? 0));
  }

  layers.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));

  const canvas = WORKSHOP_FRAME_MANIFEST.canvas;
  const hand = assets.get('hand_r');
  const gripLocal = hand?.sockets.grip ?? ([60, 61.6] as const);
  const handM = matrices.get('hand_r') ?? identity();
  const gripWorld = transformPoint(handM, gripLocal[0], gripLocal[1]);

  return {
    atlasVersion: 'v1',
    chassisId: input.loadout.chassis || 'chassis-basic',
    paintId: paintVisual.cataloguePaintId,
    paintVisual: paintVisual.visual,
    weaponId: weapon.catalogueId,
    weaponKind: weapon.kind,
    facing,
    mirrored: facing === 'left',
    motionPose,
    placeholder: false,
    canvas: { width: canvas[0], height: canvas[1], provisional: true },
    grip: { x: gripWorld.x, y: gripWorld.y, provisional: true },
    layers,
    kitId: WORKSHOP_FRAME_KIT_ID,
    kitPoseKey: MOTION_POSE_TO_KIT[motionPose],
  };
}

/** Feedback helpers for Game Art / tests. */
export function workshopFramePaintToken(paintId: string): string {
  return WORKSHOP_FRAME_MANIFEST.paint_tokens[resolveKitPaint(paintId)];
}

export function listWorkshopFrameGaps(): readonly string[] {
  return [
    'ACTIVE pin is v002 only; v001 assets removed — must_not_mix_versions (coords/padding differ). Prefer sealed atomic packs so F7 never sees partial trees.',
    'Kit pose keys include heavy_windup/heavy_attack; F7 MotionPose only exposes attack→quick_attack — need product mapping for heavy hits without forking props. heavy_windup.root_y changed 20→45 in v002 only.',
    'Runtime uses precomposited parts/{id}-{paint}.png (documented fallback). Live under→mask→over compositing needs Skia or offline bake; RN Image cannot alpha-mask tint alone.',
    'No arena/FX/audio in kit-v002 — fight stage still uses separate quiet-arena placeholders when those land.',
    'Shield/drone/decal are reserved only; assembler ignores loadout.shield/drone/decals.',
    'l/r are view sides not anatomical — document for animators; mirror is whole-hierarchy scaleX about canvas centre.',
    'motion_bounds are absolute relative-joint windows, not proven collision-free for arbitrary combos.',
    'status=integration-prototype-not-accepted — not Carlos likeness / native perf / replay acceptance.',
    'Atlas null; F5/F6 atlas/vN packaging not yet aligned (mediaKey paths differ: parts/torso-oxide.png vs parts/chassis-basic/...).',
    'Weapon media ids use underscores (weapon_sword); catalogue/F5 use hyphens (weapon-sword) — adapter maps, keep both until atlas rename.',
    'Float socket values (e.g. neck y 51.39999999999999) are exact JSON serializations — consume as floats; do not round in the adapter.',
  ];
}
