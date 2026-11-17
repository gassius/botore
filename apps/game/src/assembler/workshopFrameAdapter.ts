/**
 * Adapter: Workshop Frame kit media schema → existing BotAssembler props/model.
 *
 * ACTIVE PIN: kit-v003.1 (family workshop-frame-v003). Atomic swap —
 * NEVER mix v002/v001 tiles or pose numbers with v003.x assets.
 *
 * Does NOT invent a parallel public component API. Maps kit paint/weapon/pose
 * ids onto F7 `assembleBot` / `BotAssemblerProps`. Catalogue ids stay
 * paint-crimson / paint-cobalt / weapon-* (no catalogue expansion).
 */

import kitManifestJson from '../../assets/workshop-frame-kit-v003/manifest.json';
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
  KitPoseEntry,
  KitWeaponKind,
  WorkshopFrameManifest,
} from './workshopFrameTypes';

export const WORKSHOP_FRAME_MANIFEST = kitManifestJson as unknown as WorkshopFrameManifest;

if (WORKSHOP_FRAME_MANIFEST.version !== ACTIVE_WORKSHOP_FRAME_ASSET_VERSION) {
  throw new Error(
    `Workshop Frame version mismatch: manifest=${WORKSHOP_FRAME_MANIFEST.version} assets=${ACTIVE_WORKSHOP_FRAME_ASSET_VERSION}`,
  );
}

export const WORKSHOP_FRAME_KIT_ID = `${WORKSHOP_FRAME_MANIFEST.kit_id}-${WORKSHOP_FRAME_MANIFEST.version}`;
export const ACTIVE_WORKSHOP_FRAME_FAMILY =
  WORKSHOP_FRAME_MANIFEST.family ?? `workshop-frame-${WORKSHOP_FRAME_MANIFEST.version}`;

/**
 * F7 MotionPose → kit pose key (sketch motion).
 * Combat authority is sealed replay events → MotionPose (see
 * `motionPoseFromSealedAttack`); this table only resolves kit geometry.
 * Legacy attack / heavy_* / hit keys remain; pose_aliases map them onto A2 keys.
 */
export const MOTION_POSE_TO_KIT: Readonly<Record<MotionPose, string>> = {
  idle: 'idle',
  attack: 'quick_attack',
  heavy_windup: 'heavy_windup',
  heavy_attack: 'heavy_attack',
  dodge: 'dodge',
  hit: 'hit',
  defeat: 'defeat',
  // A5: kit `portrait` (paint+weapon). A3: approved overhead `victory`.
  portrait: 'portrait',
  victory: 'victory',
  // A2 first-pass fight keys (kit-v003.1 timing).
  walk_in: 'walk_in',
  windup: 'windup',
  strike: 'strike',
  follow_through: 'follow_through',
  recovery: 'recovery',
  hit_react: 'hit_react',
  knockout: 'knockout',
};

/** Resolve MotionPose → kit pose key; fall back when the active pin lacks the key. */
export function resolveKitPoseKey(
  motionPose: MotionPose,
  manifest: WorkshopFrameManifest = WORKSHOP_FRAME_MANIFEST,
): string {
  const preferred = MOTION_POSE_TO_KIT[motionPose] ?? 'idle';
  if (manifest.poses[preferred]) {
    return preferred;
  }
  if (motionPose === 'portrait' && manifest.poses.idle) {
    return 'idle';
  }
  return manifest.poses.idle ? 'idle' : preferred;
}

/** Body parts + hand wraps (finger layers). Weapons resolved separately. */
const DRAW_PART_IDS = [
  'torso',
  'head',
  'pelvis',
  'upper_arm_l',
  'forearm_l',
  'hand_l',
  'hand_l_wrap',
  'thigh_l',
  'shin_l',
  'foot_l',
  'upper_arm_r',
  'forearm_r',
  'hand_r',
  'hand_r_wrap',
  'thigh_r',
  'shin_r',
  'foot_r',
] as const;

const EMPTY_POSE: KitPoseEntry = { root: { x: 0, y: 0 }, parts: {} };

function assetMap(manifest: WorkshopFrameManifest): Map<string, KitAsset> {
  return new Map(manifest.assets.map((a) => [a.id, a]));
}

function resolveKitPaint(paintId: string): KitPaintId {
  return resolvePaintVisual(paintId).visual;
}

function resolveKitWeaponKind(weaponId: string): KitWeaponKind {
  return resolveWeaponKit(weaponId).kind;
}

function resolveKitWeaponAssetId(weaponId: string): string {
  const kind = resolveKitWeaponKind(weaponId);
  return WORKSHOP_FRAME_MANIFEST.weapons[kind]?.asset ?? `weapon_${kind}`;
}

/**
 * v003 pose lookup: poses[poseId][weaponId] ?? poses[poseId]["*"].
 * Follows pose_aliases when present (e.g. quick_attack → strike).
 * Do not port v002 flat delta numbers.
 */
export function resolveWorkshopFramePose(
  kitPoseKey: string,
  weaponKind: KitWeaponKind,
): KitPoseEntry {
  const aliases = WORKSHOP_FRAME_MANIFEST.pose_aliases ?? {};
  const resolvedKey = aliases[kitPoseKey] ?? kitPoseKey;
  const table =
    WORKSHOP_FRAME_MANIFEST.poses[resolvedKey] ?? WORKSHOP_FRAME_MANIFEST.poses[kitPoseKey];
  if (!table) return EMPTY_POSE;
  return table[weaponKind] ?? table['*'] ?? EMPTY_POSE;
}

function poseRot(pose: KitPoseEntry, assetId: string): number {
  return pose.parts[assetId]?.rot ?? 0;
}

/**
 * Build world matrices for the robot hierarchy + selected weapon + wraps.
 * Weapon is a normal child of hand_r.grip (pivot = grip_main, angle = attach_angle).
 * No hardcoded 180° grip rotation.
 */
export function buildWorkshopFrameWorldMatrices(
  paintId: string,
  weaponId: string,
  motionPose: MotionPose,
): {
  paint: KitPaintId;
  weaponKind: KitWeaponKind;
  weaponAssetId: string;
  kitPoseKey: string;
  pose: KitPoseEntry;
  matrices: Map<string, Mat3>;
  anglesCw: Map<string, number>;
} {
  const manifest = WORKSHOP_FRAME_MANIFEST;
  const assets = assetMap(manifest);
  const paint = resolveKitPaint(paintId);
  const weaponKind = resolveKitWeaponKind(weaponId);
  const weaponAssetId = resolveKitWeaponAssetId(weaponId);
  const kitPoseKey = resolveKitPoseKey(motionPose, manifest);
  const pose = resolveWorkshopFramePose(kitPoseKey, weaponKind);
  const weaponDef = manifest.weapons[weaponKind];

  const matrices = new Map<string, Mat3>();
  const anglesCw = new Map<string, number>();

  const torso = assets.get('torso');
  if (!torso) {
    throw new Error(`${ACTIVE_WORKSHOP_FRAME_FAMILY} missing torso`);
  }

  // Keep world coords in the 640 rig frame. Kit-v003.1 `stage` (800 +
  // rig_origin) is optional drawing margin — fight/replay use overflow
  // instead of translating every pose (would shrink bots at size/800).
  // torso.rot is the root rotation (replaces v002 root_angle).
  const rootAngle = torso.angle + poseRot(pose, 'torso');
  const rootX = manifest.root.position[0] + (pose.root.x ?? 0);
  const rootY = manifest.root.position[1] + (pose.root.y ?? 0);
  const torsoM = multiply(
    multiply(translate(rootX, rootY), rotateCwDeg(rootAngle)),
    translate(-torso.pivot[0], -torso.pivot[1]),
  );
  matrices.set('torso', torsoM);
  anglesCw.set('torso', rootAngle);

  const pending = DRAW_PART_IDS.filter((id) => id !== 'torso') as string[];
  // Equipped weapon is a normal child of hand_r.grip.
  if (assets.get(weaponAssetId)?.parent) {
    pending.push(weaponAssetId);
  }

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

      let socketX = socket[0];
      let socketY = socket[1];
      // Optional main-grip offset (usually [0,0]).
      if (id === weaponAssetId && weaponDef?.grips?.main?.offset) {
        socketX += weaponDef.grips.main.offset[0] ?? 0;
        socketY += weaponDef.grips.main.offset[1] ?? 0;
      }

      // Wraps are never posed (angle 0 + no rot). Weapon follows hand via attach_angle on asset.angle.
      const rot = id.endsWith('_wrap') ? 0 : poseRot(pose, id);
      const angle = asset.angle + rot;
      const local = childLocalMatrix(socketX, socketY, angle, asset.pivot[0], asset.pivot[1]);
      const world = multiply(parentM, local);
      matrices.set(id, world);
      anglesCw.set(id, (anglesCw.get(asset.parent) ?? 0) + angle);
      pending.splice(i, 1);
      progressed = true;
    }
    if (!progressed) break;
  }

  return { paint, weaponKind, weaponAssetId, kitPoseKey, pose, matrices, anglesCw };
}

function layerRole(asset: KitAsset): AssembledLayer['role'] {
  if (asset.role === 'weapon' || asset.id.startsWith('weapon_')) return 'weapon';
  if (asset.id === 'head') return 'head';
  if (asset.id === 'torso') return 'torso';
  if (asset.id.startsWith('hand')) return 'hand';
  return 'torso';
}

function layerFromAsset(
  asset: KitAsset,
  paint: KitPaintId,
  matrix: Mat3,
  rotateCw: number,
  zIndex: number,
): AssembledLayer {
  const topLeft = transformPoint(matrix, 0, 0);
  const pivotWorld = transformPoint(matrix, asset.pivot[0], asset.pivot[1]);
  const decomp = decomposeTranslateRotate(matrix);
  const paintToken = WORKSHOP_FRAME_MANIFEST.paint_tokens[paint];
  return {
    id: asset.id,
    role: layerRole(asset),
    kind: asset.id.startsWith('weapon_') ? 'weapon' : asset.has_paint ? 'paint' : 'metal',
    zIndex,
    x: topLeft.x,
    y: topLeft.y,
    width: asset.width,
    height: asset.height,
    // Paint token used only to tint the mask layer — never a whole-sprite tint.
    color: paintToken,
    isPaintMask: asset.has_paint,
    label: `${WORKSHOP_FRAME_KIT_ID}:${asset.id}`,
    // Precomposite kept as reference/fallback; live path is under→mask→over.
    imagePath: asset.files[paint],
    materialUnderPath: asset.material_under,
    materialOverPath: asset.material_over,
    ...(asset.has_paint ? { paintMaskPath: asset.paint_mask } : {}),
    paintComposite: true,
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

/**
 * Assemble using measured kit-v003 geometry.
 * Paint swap uses kit masks (under → tinted mask → over), not a whole-robot tint.
 * Precomposited `parts/{id}-{paint}.png` remain on each layer as fallback/reference.
 */
export function assembleWorkshopFrame(input: AssembleWorkshopFrameInput): AssembledBot {
  const paintId = input.paintId ?? input.loadout.paint;
  const weaponId = input.weaponId ?? input.loadout.weapon;
  const motionPose = input.motionPose ?? 'idle';
  const facing = input.facing;
  const paintVisual = resolvePaintVisual(paintId);
  const weapon = resolveWeaponKit(weaponId);

  const { paint, weaponKind, weaponAssetId, kitPoseKey, matrices, anglesCw } =
    buildWorkshopFrameWorldMatrices(paintId, weaponId, motionPose);

  const assets = assetMap(WORKSHOP_FRAME_MANIFEST);
  const zOverrides = WORKSHOP_FRAME_MANIFEST.weapons[weaponKind]?.z_overrides ?? {};
  const layers: AssembledLayer[] = [];

  for (const id of DRAW_PART_IDS) {
    const asset = assets.get(id);
    const matrix = matrices.get(id);
    if (!asset || !matrix) continue;
    const zIndex = zOverrides[id] ?? asset.z;
    layers.push(layerFromAsset(asset, paint, matrix, anglesCw.get(id) ?? 0, zIndex));
  }

  const weaponAsset = assets.get(weaponAssetId);
  const weaponMatrix = matrices.get(weaponAssetId);
  if (weaponAsset && weaponMatrix) {
    const zIndex = zOverrides[weaponAssetId] ?? weaponAsset.z;
    layers.push(
      layerFromAsset(weaponAsset, paint, weaponMatrix, anglesCw.get(weaponAssetId) ?? 0, zIndex),
    );
  }

  layers.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));

  // Always report the 640 rig canvas so BotAssembler scale matches
  // scenePlacement KIT_CANVAS_WIDTH and ground_anchor math.
  const canvas = WORKSHOP_FRAME_MANIFEST.canvas;
  const hand = assets.get('hand_r');
  const gripLocal = hand?.sockets.grip ?? ([60, 62] as const);
  const handM = matrices.get('hand_r') ?? identity();
  const gripWorld = transformPoint(handM, gripLocal[0], gripLocal[1]);

  return {
    atlasVersion: 'v3',
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
    kitPoseKey,
  };
}

/** Feedback helpers for Game Art / tests. */
export function workshopFramePaintToken(paintId: string): string {
  return WORKSHOP_FRAME_MANIFEST.paint_tokens[resolveKitPaint(paintId)];
}

export function listWorkshopFrameGaps(): readonly string[] {
  return [
    'ACTIVE pin is v003.1 (family workshop-frame-v003); kit-v002 kept as history — must_not_mix_versions.',
    'Pose format is nested {weapon|"*": {root, parts.rot}}; do not port v002 flat pose numbers.',
    'v003.1 stage is 800×800 with rig_origin [80,160] for overflow margin; assembler keeps 640 canvas + rig coords (Replay overflow:visible). Mirror about rig x=320.',
    'weapon_grip_rotation_degrees removed — weapons are normal children of hand_r.grip with per-weapon attach_angle.',
    'Always draw hand_l_wrap / hand_r_wrap; apply weapons[w].z_overrides (axe lifts hand_l_wrap to 91).',
    'Paint path: under→mask-tint(color)→over via kit materials/masks. Precomposited parts/{id}-{paint}.png are fallback only.',
    'A2 first-pass wires kit timing.per_weapon (30 fps) into Fight View; in-betweens / KO fall frames drop in via timing+poses with no code change.',
    'Shield/drone/decal are reserved only; assembler ignores loadout.shield/drone/decals.',
    'Atlas pack v3 publishes kit media at parts/<hyphenatedPartId>/…; Metro kit remains render fallback until Storage cold-fetch is proven.',
    'MotionPose heavy_* is mapped (C11); heavy_windup / heavy_attack use nested per-weapon pose entries (aliases → windup/strike on v003.1).',
    'A5 MotionPose `portrait` + A3 MotionPose `victory`/`defeat` are approved on kit-v003.1.',
    'Weapon media ids use underscores (weapon_sword); catalogue/F5 atlas partIds use hyphens (weapon-sword) — adapter maps both.',
  ];
}
