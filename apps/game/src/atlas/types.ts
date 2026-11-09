/**
 * Client-side atlas pack loader types (F6).
 * Wire shape for manifests comes from F5 `get_atlas_manifest` /
 * `@botore/contracts` AtlasManifestResponse — no Supabase SDK in the game app.
 */

import type { AtlasManifestEntryDto, AtlasManifestResponse } from '@botore/contracts';

export type { AtlasManifestEntryDto, AtlasManifestResponse };

/** Base-pack audio roles that ship in the app bundle (F5 manifest.basePack keys). */
export const BASE_AUDIO_ROLES = [
  'uiTap',
  'musicLoop',
  'hit',
  'dodge',
  'defeat',
  'hush',
  'win',
  'swing',
] as const;

export type BaseAudioRole = (typeof BASE_AUDIO_ROLES)[number];

/** Pack-relative paths for the bundled base pack (mirrors atlas/vN/base/…). */
export const BUNDLED_BASE_AUDIO_PATHS: Readonly<Record<BaseAudioRole, string>> = {
  uiTap: 'base/audio/ui-tap.m4a',
  musicLoop: 'base/audio/music-loop.m4a',
  hit: 'base/audio/hit.m4a',
  dodge: 'base/audio/dodge.m4a',
  defeat: 'base/audio/defeat.m4a',
  hush: 'base/audio/hush.m4a',
  win: 'base/audio/win.m4a',
  swing: 'base/audio/swing.m4a',
};

/**
 * Soft settle deadline for optional PackTransport ops (ms).
 * Not a product SLA / cache budget — override in wiring or tests.
 * Never-settling transport must lose to this race so bundled/silent
 * fallbacks remain obtainable.
 */
export const DEFAULT_TRANSPORT_TIMEOUT_MS = 30_000;

export type PackTransport = {
  fetchManifest(version: string): Promise<AtlasManifestResponse>;
  /** Download object bytes for a storage path like `v1/parts/chassis-basic/body.png`. */
  downloadObject(storagePath: string): Promise<Uint8Array>;
};

export type PackFileStore = {
  /** Root URI / key prefix for this store (informative). */
  readonly rootUri: string;
  exists(relativePath: string): Promise<boolean>;
  readText(relativePath: string): Promise<string>;
  writeText(relativePath: string, contents: string): Promise<void>;
  writeBytes(relativePath: string, data: Uint8Array): Promise<void>;
  ensureDir(relativePath: string): Promise<void>;
  /** Absolute/local URI the playback layer can open. */
  uriFor(relativePath: string): string;
  /** Best-effort delete (used for atomic index tmp cleanup). */
  remove?(relativePath: string): Promise<void>;
  /**
   * Serialize work for a lock key across callers that share this store.
   * Cache-index merge commits use this so concurrent same-version loads
   * cannot clobber each other's discoverability entries.
   */
  runExclusive?<T>(lockKey: string, task: () => Promise<T>): Promise<T>;
};

export type BundledBasePack = {
  readonly roles: readonly BaseAudioRole[];
  /** Local URI for a bundled base clip, or null if that role is unavailable. */
  resolveUri(role: BaseAudioRole): string | null;
};

export type EnsurePacksRequest = {
  atlasVersion: string;
  /** Catalogue part ids for the player's stable and/or current fight. */
  partIds: readonly string[];
  includeArena?: boolean;
  includeFx?: boolean;
  /**
   * When true (default), missing network falls back to a same-version cache
   * and never rejects the fight for audio gaps.
   * When false, a rejected fetch **or** a wrong-version manifest pin fails hard.
   */
  allowOffline?: boolean;
};

export type ResolvedAssetSource = 'bundle' | 'cache' | 'download' | 'missing';

export type ResolvedAsset = {
  assetKey: string;
  kind: 'image' | 'audio' | 'manifest';
  partId: string | null;
  role: string;
  path: string;
  storagePath: string | null;
  localUri: string | null;
  source: ResolvedAssetSource;
};

export type EnsurePacksResult = {
  version: string;
  /** True when every requested non-base asset came from an existing cache. */
  fromCache: boolean;
  /** True when at least one network download succeeded this call. */
  fetched: boolean;
  /** True when the loader used cache / bundle after a transport failure. */
  offline: boolean;
  assets: ResolvedAsset[];
};

export type CacheIndexEntry = {
  assetKey: string;
  path: string;
  kind: 'image' | 'audio' | 'manifest';
  relativeFile: string;
  /** Original F5 manifest partId — persisted so cache hits do not reinvent it. */
  partId: string | null;
  /** Original F5 manifest role — persisted so cache hits do not reinvent it. */
  role: string;
};

export type CacheIndex = {
  version: string;
  entries: Record<string, CacheIndexEntry>;
};

export type AudioResolveSource = 'part' | 'base' | 'silent';

export type ResolvedAudioCue = {
  uri: string | null;
  source: AudioResolveSource;
  role: BaseAudioRole;
};
