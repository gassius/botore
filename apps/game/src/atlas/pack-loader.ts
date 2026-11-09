import type { AtlasManifestEntryDto, AtlasManifestResponse } from '@botore/contracts';
import { selectEntriesToFetch, storagePathForEntry } from './manifest-select';
import { areKeysCached, cacheFilePath, mergeCommitCacheIndex, readCacheIndex } from './pack-cache';
import type {
  BundledBasePack,
  CacheIndexEntry,
  EnsurePacksRequest,
  EnsurePacksResult,
  PackFileStore,
  PackTransport,
  ResolvedAsset,
} from './types';
import { BASE_AUDIO_ROLES, BUNDLED_BASE_AUDIO_PATHS, DEFAULT_TRANSPORT_TIMEOUT_MS } from './types';

export type PackLoaderDeps = {
  transport: PackTransport;
  store: PackFileStore;
  bundledBase: BundledBasePack;
  /**
   * Soft settle deadline for optional transport ops (ms).
   * Defaults to DEFAULT_TRANSPORT_TIMEOUT_MS — not a product budget.
   */
  transportTimeoutMs?: number;
};

/**
 * On-demand atlas pack loader + disk cache (F6).
 *
 * - Catalogue / arena / FX packs download by manifest; only base audio ships in-app.
 * - Same-version cache is reused offline; a new atlas version uses a new cache dir → fetch.
 * - Missing or failed audio never rejects — callers use resolveAudioCue fallbacks.
 * - Transport and cache I/O are best-effort: stalled network loses to the soft deadline;
 *   index write failures must not prevent returning bundled / already-resolved assets.
 */
export class AtlasPackLoader {
  private readonly transport: PackTransport;
  private readonly store: PackFileStore;
  private readonly bundledBase: BundledBasePack;
  private readonly transportTimeoutMs: number;

  constructor(deps: PackLoaderDeps) {
    this.transport = deps.transport;
    this.store = deps.store;
    this.bundledBase = deps.bundledBase;
    this.transportTimeoutMs = deps.transportTimeoutMs ?? DEFAULT_TRANSPORT_TIMEOUT_MS;
  }

  async ensurePacks(request: EnsurePacksRequest): Promise<EnsurePacksResult> {
    const allowOffline = request.allowOffline !== false;
    const version = request.atlasVersion;
    let offline = false;
    let fetched = false;
    let manifest: AtlasManifestResponse | null = null;

    try {
      manifest = await this.settleTransport(
        () => this.transport.fetchManifest(version),
        'fetchManifest',
      );
    } catch (err) {
      offline = true;
      if (!allowOffline) {
        throw err instanceof Error ? err : new Error(`atlas_manifest_unavailable:${version}`);
      }
    }

    if (manifest && manifest.version !== version) {
      // Wrong pin: same class of failure as a rejected fetch when offline is disallowed.
      if (!allowOffline) {
        throw new Error(
          `atlas_manifest_version_mismatch:wanted=${version}:got=${manifest.version}`,
        );
      }
      offline = true;
      manifest = null;
    }

    const needed = manifest ? selectEntriesToFetch(manifest, request) : [];
    const neededKeys = needed.map((e) => e.assetKey);

    try {
      if (manifest && (await areKeysCached(this.store, version, neededKeys))) {
        const assets = await this.resolveFromCache(version, needed, true);
        return this.finish(version, true, false, offline, assets);
      }
    } catch {
      // Cache probe failed — continue toward download / offline paths.
      offline = true;
    }

    if (!manifest) {
      const assets = await this.safeResolveOfflineCache(version);
      return this.finish(version, assets.length > 0, false, true, assets);
    }

    const assets: ResolvedAsset[] = [];
    const newIndexEntries: Record<string, CacheIndexEntry> = {};

    // Snapshot for per-entry cache hits; merge-commit re-reads under lock later.
    let indexSnapshot: Record<string, CacheIndexEntry> = {};
    try {
      const existing = await readCacheIndex(this.store, version);
      if (existing) indexSnapshot = existing.entries;
    } catch {
      offline = true;
    }

    for (const entry of needed) {
      const existing = indexSnapshot[entry.assetKey];
      if (existing) {
        try {
          if (await this.store.exists(existing.relativeFile)) {
            assets.push({
              assetKey: entry.assetKey,
              kind: entry.kind,
              partId: entry.partId,
              role: entry.role,
              path: entry.path,
              storagePath: storagePathForEntry(manifest, entry),
              localUri: this.store.uriFor(existing.relativeFile),
              source: 'cache',
            });
            continue;
          }
        } catch {
          // Fall through to download / missing.
        }
      }

      const storagePath = storagePathForEntry(manifest, entry);
      const relativeFile = cacheFilePath(version, entry.path);
      try {
        const bytes = await this.settleTransport(
          () => this.transport.downloadObject(storagePath),
          'downloadObject',
        );
        await this.store.ensureDir(relativeFile.includes('/') ? dirname(relativeFile) : '');
        await this.store.writeBytes(relativeFile, bytes);
        newIndexEntries[entry.assetKey] = {
          assetKey: entry.assetKey,
          path: entry.path,
          kind: entry.kind,
          relativeFile,
          partId: entry.partId,
          role: entry.role,
        };
        fetched = true;
        assets.push({
          assetKey: entry.assetKey,
          kind: entry.kind,
          partId: entry.partId,
          role: entry.role,
          path: entry.path,
          storagePath,
          localUri: this.store.uriFor(relativeFile),
          source: 'download',
        });
      } catch {
        offline = true;
        // Audio/image gap: record missing and continue — never block the fight.
        assets.push({
          assetKey: entry.assetKey,
          kind: entry.kind,
          partId: entry.partId,
          role: entry.role,
          path: entry.path,
          storagePath,
          localUri: null,
          source: 'missing',
        });
      }
    }

    // Index commit is best-effort: files may already be on disk; prior index must remain
    // readable if this write fails (mergeCommit uses tmp→final under exclusive lock).
    try {
      await mergeCommitCacheIndex(this.store, version, newIndexEntries);
    } catch {
      offline = true;
    }

    return this.finish(
      version,
      !fetched && assets.every((a) => a.source === 'cache' || a.source === 'missing'),
      fetched,
      offline,
      assets,
    );
  }

  private finish(
    version: string,
    fromCache: boolean,
    fetched: boolean,
    offline: boolean,
    assets: ResolvedAsset[],
  ): EnsurePacksResult {
    return {
      version,
      fromCache,
      fetched,
      offline,
      assets: [...this.bundledBaseAssets(), ...assets],
    };
  }

  private settleTransport<T>(op: () => Promise<T>, label: string): Promise<T> {
    return settleWithTimeout(op(), this.transportTimeoutMs, label);
  }

  private bundledBaseAssets(): ResolvedAsset[] {
    return BASE_AUDIO_ROLES.map((role) => {
      const path = BUNDLED_BASE_AUDIO_PATHS[role];
      const uri = this.bundledBase.resolveUri(role);
      return {
        assetKey: `base.audio.${role}`,
        kind: 'audio' as const,
        partId: null,
        role,
        path,
        storagePath: null,
        localUri: uri,
        source: uri ? ('bundle' as const) : ('missing' as const),
      };
    });
  }

  private async safeResolveOfflineCache(version: string): Promise<ResolvedAsset[]> {
    try {
      const cached = await readCacheIndex(this.store, version);
      if (!cached) return [];
      return await this.resolveIndexEntries(version, Object.values(cached.entries), true);
    } catch {
      return [];
    }
  }

  private async resolveFromCache(
    version: string,
    entries: AtlasManifestEntryDto[],
    fromCache: boolean,
  ): Promise<ResolvedAsset[]> {
    const index = await readCacheIndex(this.store, version);
    if (!index) return [];
    const cachedEntries = entries
      .map((e) => index.entries[e.assetKey])
      .filter((e): e is NonNullable<typeof e> => e !== undefined);
    return this.resolveIndexEntries(version, cachedEntries, fromCache);
  }

  private async resolveIndexEntries(
    version: string,
    entries: CacheIndexEntry[],
    fromCache: boolean,
  ): Promise<ResolvedAsset[]> {
    const out: ResolvedAsset[] = [];
    for (const entry of entries) {
      let exists = false;
      try {
        exists = await this.store.exists(entry.relativeFile);
      } catch {
        exists = false;
      }
      out.push({
        assetKey: entry.assetKey,
        kind: entry.kind,
        partId: entry.partId,
        role: entry.role,
        path: entry.path,
        storagePath: `${version}/${entry.path}`,
        localUri: exists ? this.store.uriFor(entry.relativeFile) : null,
        source: exists ? (fromCache ? 'cache' : 'download') : 'missing',
      });
    }
    return out;
  }
}

function dirname(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  return idx === -1 ? '' : relativePath.slice(0, idx);
}

/**
 * Soft deadline race for optional transport. Cancels nothing on the wire
 * (PackTransport has no AbortSignal yet) — it only unblocks the loader so
 * bundled / silent fallbacks remain obtainable when the peer never settles.
 */
export function settleWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`atlas_transport_timeout:${label}:${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
