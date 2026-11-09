/**
 * Active Workshop Frame media pin for the visible F7 build.
 * v001 remains immutable on disk — never pair its coordinates with v002 PNGs.
 */
export const ACTIVE_WORKSHOP_FRAME_ASSET_VERSION = 'v002' as const;
export type ActiveWorkshopFrameAssetVersion = typeof ACTIVE_WORKSHOP_FRAME_ASSET_VERSION;
