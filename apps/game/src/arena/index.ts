export {
  ACTIVE_ENVIRONMENT_ASSET_VERSION,
  ENVIRONMENT_LAYER_Z,
  ENVIRONMENT_SCENE_CANVAS,
} from './environmentPin';
export {
  ENVIRONMENT_FX_META,
  ENVIRONMENT_MANIFEST,
  ENVIRONMENT_SEALED_SHA256,
} from './environmentAssets';
export {
  fitSceneToViewport,
  kitOriginFromGround,
  provisionalContactPoint,
  startPlacement,
} from './scenePlacement';
export type { ArenaSlot, PlacedActor } from './scenePlacement';
export type { RepairYardArenaProps } from './RepairYardArena';
export type { ActiveFxCue, EventFxLayerProps, FxFamily } from './EventFxLayer';

// UI modules (Metro PNG requires) — import directly from files in app code:
// `./RepairYardArena`, `./EventFxLayer`, `./environmentMetroAssets`
