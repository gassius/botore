/**
 * F6 — client on-demand atlas pack loader and cache.
 *
 * Native-first foundation. Web preview may use the in-memory store; acceptance
 * is Android/iOS. Missing audio must never block a fight — use resolveAudioCue.
 */

export {
  BASE_AUDIO_ROLES,
  BUNDLED_BASE_AUDIO_PATHS,
  DEFAULT_TRANSPORT_TIMEOUT_MS,
  type AtlasManifestEntryDto,
  type AtlasManifestResponse,
  type AudioResolveSource,
  type BaseAudioRole,
  type BundledBasePack,
  type CacheIndex,
  type CacheIndexEntry,
  type EnsurePacksRequest,
  type EnsurePacksResult,
  type PackFileStore,
  type PackTransport,
  type ResolvedAsset,
  type ResolvedAudioCue,
} from './types';

export {
  bundledBaseAudioPathForRole,
  createEmptyBundledBasePack,
  createUriMapBundledBasePack,
  isBundledBaseAudioPath,
} from './bundled-base-pack';

export { createMemoryPackFileStore, resetMemoryPackFileStore } from './memory-file-store';
export { selectEntriesToFetch, storagePathForEntry } from './manifest-select';
export {
  areKeysCached,
  cacheDirForVersion,
  cacheFilePath,
  cacheIndexPath,
  cacheIndexTmpPath,
  canonicalCacheRoot,
  mergeCommitCacheIndex,
  normalizeCacheIndex,
  readCacheIndex,
  runStoreExclusive,
  writeCacheIndex,
} from './pack-cache';
export { AtlasPackLoader, settleWithTimeout, type PackLoaderDeps } from './pack-loader';
export {
  findPartAudioUri,
  resolveAudioCue,
  resolveTriggerAudio,
  triggerToBaseRole,
} from './resolve-audio';

export {
  WORKSHOP_FRAME_BODY_ASSET_IDS,
  WORKSHOP_FRAME_KIT,
  WORKSHOP_FRAME_WEAPON_ASSET_IDS,
  atlasPathForWorkshopKitFile,
  canonicalAtlasPartId,
  isWorkshopFrameAtlasPath,
  partIdsForWorkshopFrameLoadout,
  resolvePaintCatalogueId,
  resolvePaintToken,
  resolveWeaponCatalogueId,
  resolveWorkshopWeaponAssetId,
  workshopFrameAtlasPathsForAsset,
} from './workshop-frame-paths';

// Native Expo adapters (documentDirectory cache + Asset.fromModule base pack)
// live in ./expo-pack-store and ./expo-bundled-base-pack — import those files
// directly from app wiring. They are intentionally not re-exported here so
// headless vitest does not load Metro asset requires.
