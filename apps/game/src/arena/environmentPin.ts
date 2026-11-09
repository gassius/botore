/**
 * Active Repair Yard environment pin for F10 replay presentation.
 * Keep wall / floor / markings / contact-shadow as separate layers.
 * PROVISIONAL artwork — not final camera / timing / native acceptance.
 */
export const ACTIVE_ENVIRONMENT_ASSET_VERSION = 'environment-v001' as const;
export type ActiveEnvironmentAssetVersion = typeof ACTIVE_ENVIRONMENT_ASSET_VERSION;

export const ENVIRONMENT_SCENE_CANVAS = { width: 720, height: 1120 } as const;

/** Presentation layer order from environment-v001 manifest (proposed, not F7 z-order). */
export const ENVIRONMENT_LAYER_Z = {
  wall: 0,
  floor: 10,
  markings: 20,
  contactShadows: 30,
  farActor: 40,
  dodgeFx: 45,
  nearActor: 50,
  defeatFx: 55,
  hitFx: 80,
} as const;

export type ArenaFxFamily = 'hit' | 'dodge' | 'defeat';

/** FX family z values — arena siblings, not nested under an unranked parent. */
export const FX_FAMILY_Z: Record<ArenaFxFamily, number> = {
  dodge: ENVIRONMENT_LAYER_Z.dodgeFx,
  defeat: ENVIRONMENT_LAYER_Z.defeatFx,
  hit: ENVIRONMENT_LAYER_Z.hitFx,
};

export function fxCueSiblingZ(family: ArenaFxFamily): number {
  return FX_FAMILY_Z[family];
}

export function fxRendersAboveFloor(family: ArenaFxFamily): boolean {
  return FX_FAMILY_Z[family] > ENVIRONMENT_LAYER_Z.floor;
}

/** Peak-visibility frame for 3-frame FX strips (hit-spark-01 / dust-01). */
export function fxPeakFrameIndex(frameCount: number): number {
  if (frameCount <= 1) return 0;
  return Math.min(1, frameCount - 1);
}
