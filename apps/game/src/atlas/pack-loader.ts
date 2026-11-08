import type { AtlasManifestEntryDto, AtlasManifestResponse } from '@botore/contracts';
import { selectEntriesToFetch, storagePathForEntry } from './manifest-select';
import { areKeysCached, cacheFilePath, readCacheIndex, writeCacheIndex } from './pack-cache';
import type {
  BundledBasePack,
  CacheIndex,
  EnsurePacksRequest,
  EnsurePacksResult,
  PackFileStore,
  PackTransport,
  ResolvedAsset,
} from './types';
import { BASE_AUDIO_ROLES, BUNDLED_BASE_AUDIO_PATHS } from './types';

export type PackLoaderDeps = {
  transport: PackTransport;
  store: PackFileStore;
  bundledBase: BundledBasePack;
};

/**
 * On-demand atlas pack loader + disk cache (F6).
 *
 * - Catalogue / arena / FX packs download by manifest; only base audio ships in-app.
 * - Same-version cache is reused offline; a new atlas version uses a new cache dir → fetch.
 * - Missing or failed audio never rejects — callers use resolveAudioCue fallbacks.
 */
export class AtlasPackLoader {
  private readonly transport: PackTransport;
  private readonly store: PackFileStore;
  private readonly bundledBase: BundledBasePack;

  constructor(deps: PackLoaderDeps) {
    this.transport = deps.transport;
    this.store = deps.store;
    this.bundledBase = deps.bundledBase;
  }

  async ensurePacks(request: EnsurePacksRequest): Promise<EnsurePacksResult> {
    const allowOffline = request.allowOffline !== false;
    const version = request.atlasVersion;
    let offline = false;
    let fetched = false;
    let manifest: AtlasManifestResponse | null = null;

    try {
      manifest = await this.transport.fetchManifest(version);
    } catch {
      offline = true;
      if (!allowOffline) {
        throw new Error(`atlas_manifest_unavailable:${version}`);
      }
    }

    if (manifest && manifest.version !== version) {
      // Defensive: treat as failure and fall back to cache for the requested pin.
      offline = true;
      manifest = null;
    }

    const needed = manifest ? selectEntriesToFetch(manifest, request) : [];
    const neededKeys = needed.map((e) => e.assetKey);

    if (manifest && (await areKeysCached(this.store, version, neededKeys))) {
      const assets = await this.resolveFromCache(version, needed, true);
      return {
        version,
        fromCache: true,
        fetched: false,
        offline,
        assets: [...this.bundledBaseAssets(), ...assets],
      };
    }

    if (!manifest) {
      // Offline: reuse same-version cache if present; still expose bundled base.
      const cached = await readCacheIndex(this.store, version);
      const assets = cached
        ? await this.resolveIndexEntries(version, Object.values(cached.entries), true)
        : [];
      return {
        version,
        fromCache: assets.length > 0,
        fetched: false,
        offline: true,
        assets: [...this.bundledBaseAssets(), ...assets],
      };
    }

    const index: CacheIndex = (await readCacheIndex(this.store, version)) ?? {
      version,
      entries: {},
    };
    const assets: ResolvedAsset[] = [];

    for (const entry of needed) {
      const existing = index.entries[entry.assetKey];
      if (existing && (await this.store.exists(existing.relativeFile))) {
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

      const storagePath = storagePathForEntry(manifest, entry);
      const relativeFile = cacheFilePath(version, entry.path);
      try {
        const bytes = await this.transport.downloadObject(storagePath);
        await this.store.ensureDir(relativeFile.includes('/') ? dirname(relativeFile) : '');
        await this.store.writeBytes(relativeFile, bytes);
        index.entries[entry.assetKey] = {
          assetKey: entry.assetKey,
          path: entry.path,
          kind: entry.kind,
          relativeFile,
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

    await writeCacheIndex(this.store, index);

    return {
      version,
      fromCache: !fetched && assets.every((a) => a.source === 'cache' || a.source === 'missing'),
      fetched,
      offline,
      assets: [...this.bundledBaseAssets(), ...assets],
    };
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
    entries: Array<{
      assetKey: string;
      path: string;
      kind: 'image' | 'audio' | 'manifest';
      relativeFile: string;
    }>,
    fromCache: boolean,
  ): Promise<ResolvedAsset[]> {
    const out: ResolvedAsset[] = [];
    for (const entry of entries) {
      const exists = await this.store.exists(entry.relativeFile);
      out.push({
        assetKey: entry.assetKey,
        kind: entry.kind,
        partId: inferPartId(entry.path),
        role: inferRole(entry.path),
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

function inferPartId(path: string): string | null {
  const m = /^parts\/([^/]+)\//.exec(path);
  return m ? m[1]! : null;
}

function inferRole(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}
