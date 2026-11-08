import type { CacheIndex, CacheIndexEntry, PackFileStore } from './types';

const INDEX_NAME = 'index.json';

export function cacheDirForVersion(version: string): string {
  return `packs/${version}`;
}

export function cacheIndexPath(version: string): string {
  return `${cacheDirForVersion(version)}/${INDEX_NAME}`;
}

export function cacheFilePath(version: string, packRelativePath: string): string {
  return `${cacheDirForVersion(version)}/files/${packRelativePath}`;
}

export async function readCacheIndex(
  store: PackFileStore,
  version: string,
): Promise<CacheIndex | null> {
  const path = cacheIndexPath(version);
  if (!(await store.exists(path))) return null;
  try {
    const raw = await store.readText(path);
    const parsed = JSON.parse(raw) as CacheIndex;
    if (!parsed || parsed.version !== version || typeof parsed.entries !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCacheIndex(store: PackFileStore, index: CacheIndex): Promise<void> {
  const dir = cacheDirForVersion(index.version);
  await store.ensureDir(dir);
  await store.writeText(cacheIndexPath(index.version), JSON.stringify(index));
}

export async function isEntryCached(
  store: PackFileStore,
  entry: CacheIndexEntry,
): Promise<boolean> {
  if (entry.relativeFile.length === 0) return false;
  return store.exists(entry.relativeFile);
}

/**
 * True when every listed assetKey is present in the cache index and on disk.
 * A different atlas version uses a different directory — changing version
 * therefore forces a fetch (empty / missing index for the new version).
 */
export async function areKeysCached(
  store: PackFileStore,
  version: string,
  assetKeys: readonly string[],
): Promise<boolean> {
  if (assetKeys.length === 0) return true;
  const index = await readCacheIndex(store, version);
  if (!index) return false;
  for (const key of assetKeys) {
    const entry = index.entries[key];
    if (!entry) return false;
    if (!(await isEntryCached(store, entry))) return false;
  }
  return true;
}
