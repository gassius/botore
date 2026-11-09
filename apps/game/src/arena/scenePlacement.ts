/**
 * Scene placement adapter for environment-v001 × Workshop Frame kit-v002.
 *
 * F7 public BotAssembler props/types are untouched. These coordinates are
 * PROVISIONAL presentation proposals (720×1120), not final camera acceptance.
 *
 * Ground anchor = sole midpoint, not F7 torso pivot.
 * origin = sceneGroundAnchor − localGroundAnchor × scale
 * Mirror whole hierarchy first (facing:'left') — do not flip tiles independently.
 */

import { ENVIRONMENT_MANIFEST, type SceneActorSpec } from './environmentAssets';
import { ENVIRONMENT_SCENE_CANVAS } from './environmentPin';

export type ArenaSlot = 'near' | 'far';

export interface PlacedActor {
  readonly slot: ArenaSlot;
  readonly paintAlias: 'oxide' | 'petrol';
  readonly weaponAlias: 'sword' | 'axe' | 'dagger';
  readonly facing: 'left' | 'right';
  /** Kit display width in scene pixels = kitCanvasWidth × scale. */
  readonly size: number;
  readonly scale: number;
  readonly groundAnchor: { readonly x: number; readonly y: number };
  readonly localGroundAnchor: { readonly x: number; readonly y: number };
  /** Top-left of kit canvas in scene space. */
  readonly origin: { readonly x: number; readonly y: number };
  readonly layer: number;
  readonly contactShadow: {
    readonly x: number;
    readonly y: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly pivotX: number;
    readonly pivotY: number;
  };
}

const KIT_CANVAS_WIDTH = 640;

function actorFromSpec(slot: ArenaSlot, spec: SceneActorSpec): PlacedActor {
  const facing: 'left' | 'right' = spec.facing.includes('mirrored') ? 'left' : 'right';
  const paintAlias = spec.paintId === 'petrol' ? 'petrol' : 'oxide';
  const weaponAlias =
    spec.weaponId === 'axe' ? 'axe' : spec.weaponId === 'dagger' ? 'dagger' : 'sword';
  const [gx, gy] = spec.ground_anchor;
  const [lx, ly] = spec.local_ground_anchor;
  const origin = {
    x: gx - lx * spec.scale,
    y: gy - ly * spec.scale,
  };
  const shadow = spec.contact_shadow;
  return {
    slot,
    paintAlias,
    weaponAlias,
    facing,
    scale: spec.scale,
    size: KIT_CANVAS_WIDTH * spec.scale,
    groundAnchor: { x: gx, y: gy },
    localGroundAnchor: { x: lx, y: ly },
    origin,
    layer: spec.layer,
    contactShadow: {
      x: shadow.position[0],
      y: shadow.position[1],
      scaleX: shadow.scale[0],
      scaleY: shadow.scale[1],
      pivotX: shadow.pivot[0],
      pivotY: shadow.pivot[1],
    },
  };
}

/** Illustrative staggered start placement from sealed environment manifest. */
export function startPlacement(): { readonly near: PlacedActor; readonly far: PlacedActor } {
  const nearSpec = ENVIRONMENT_MANIFEST.illustrative_start_actors.find((a) => a.id === 'near-left');
  const farSpec = ENVIRONMENT_MANIFEST.illustrative_start_actors.find((a) => a.id === 'far-right');
  if (!nearSpec || !farSpec) {
    throw new Error('environment-v001 missing illustrative_start_actors');
  }
  return {
    near: actorFromSpec('near', nearSpec),
    far: actorFromSpec('far', farSpec),
  };
}

/**
 * Kit canvas origin from ground anchors (adapter formula).
 * Used by tests to prove we follow the handoff contract, not torso pivots.
 */
export function kitOriginFromGround(
  groundX: number,
  groundY: number,
  localGroundX: number,
  localGroundY: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: groundX - localGroundX * scale,
    y: groundY - localGroundY * scale,
  };
}

/** Uniform fit of 720×1120 scene into a phone viewport (contain). */
export function fitSceneToViewport(
  viewportWidth: number,
  viewportHeight: number,
): { scale: number; offsetX: number; offsetY: number; width: number; height: number } {
  const sx = viewportWidth / ENVIRONMENT_SCENE_CANVAS.width;
  const sy = viewportHeight / ENVIRONMENT_SCENE_CANVAS.height;
  const scale = Math.min(sx, sy);
  const width = ENVIRONMENT_SCENE_CANVAS.width * scale;
  const height = ENVIRONMENT_SCENE_CANVAS.height * scale;
  return {
    scale,
    width,
    height,
    offsetX: (viewportWidth - width) / 2,
    offsetY: (viewportHeight - height) / 2,
  };
}

/** Contact / hit spark attachment (midpoint between near & far ground anchors). PROVISIONAL. */
export function provisionalContactPoint(
  near: PlacedActor,
  far: PlacedActor,
): { x: number; y: number } {
  return {
    x: (near.groundAnchor.x + far.groundAnchor.x) / 2,
    y: (near.groundAnchor.y + far.groundAnchor.y) / 2 - 120,
  };
}
