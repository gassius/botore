/**
 * Active Workshop Frame media pin for the visible F7 build.
 * Kit-v003 only — never pair stale v002/v001 coordinates with these PNGs.
 * kit-v002 remains vendored under assets/ as history/fallback, not the active pin.
 */
export const ACTIVE_WORKSHOP_FRAME_ASSET_VERSION = 'v003' as const;
export type ActiveWorkshopFrameAssetVersion = typeof ACTIVE_WORKSHOP_FRAME_ASSET_VERSION;
