import type { CacheIndex, CacheIndexEntry, PackFileStore } from './types';

const INDEX_NAME = 'index.json';

/** In-process exclusive chains keyed by store identity (fallback when store has no runExclusive). */
const exclusiveChains = new WeakMap<object, Map<string, Promise<unknown>>>();

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
  try {
    if (!(await store.exists(path))) return null;
    const raw = await store.readText(path);
    const parsed = JSON.parse(raw) as CacheIndex;
    if (!parsed || parsed.version !== version || typeof parsed.entries !== 'object') {
      return null;
    }
    return normalizeCacheIndex(parsed);
  } catch {
    return null;
  }
}

/**
 * Normalize entries so older indexes without partId/role still load.
 * Prefer persisted manifest metadata when present.
 */
export function normalizeCacheIndex(index: CacheIndex): CacheIndex {
  const entries: Record<string, CacheIndexEntry> = {};
  for (const [key, raw] of Object.entries(index.entries ?? {})) {
    if (!raw || typeof raw !== 'object') continue;
    const path = typeof raw.path === 'string' ? raw.path : '';
    const relativeFile = typeof raw.relativeFile === 'string' ? raw.relativeFile : '';
    if (!path || !relativeFile) continue;
    const kind =
      raw.kind === 'audio' || raw.kind === 'manifest' || raw.kind === 'image' ? raw.kind : 'image';
    entries[key] = {
      assetKey: typeof raw.assetKey === 'string' ? raw.assetKey : key,
      path,
      kind,
      relativeFile,
      partId: 'partId' in raw ? (raw.partId ?? null) : inferPartId(path),
      role: typeof raw.role === 'string' && raw.role.length > 0 ? raw.role : inferRole(path),
    };
  }
  return { version: index.version, entries };
}

/**
 * Write index via tmp → final so a failed write leaves the last valid snapshot.
 * Not a product durability SLA — best-effort atomicity for the shared cache.
 */
export async function writeCacheIndex(store: PackFileStore, index: CacheIndex): Promise<void> {
  const dir = cacheDirForVersion(index.version);
  const finalPath = cacheIndexPath(index.version);
  const tmpPath = `${finalPath}.tmp`;
  await store.ensureDir(dir);
  const payload = JSON.stringify(index);
  await store.writeText(tmpPath, payload);
  try {
    await store.writeText(finalPath, payload);
  } catch (err) {
    // Final replace failed — previous finalPath (if any) stays readable.
    throw err;
  } finally {
    if (store.remove) {
      try {
        await store.remove(tmpPath);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

/**
 * Merge `newEntries` into the on-disk index under an exclusive lock for this
 * version, so concurrent same-version loads retain each other's discoverability.
 */
export async function mergeCommitCacheIndex(
  store: PackFileStore,
  version: string,
  newEntries: Record<string, CacheIndexEntry>,
): Promise<CacheIndex> {
  if (Object.keys(newEntries).length === 0) {
    return (
      (await readCacheIndex(store, version)) ?? {
        version,
        entries: {},
      }
    );
  }
  return runStoreExclusive(store, cacheIndexPath(version), async () => {
    const current = (await readCacheIndex(store, version)) ?? {
      version,
      entries: {},
    };
    const merged: CacheIndex = {
      version,
      entries: { ...current.entries, ...newEntries },
    };
    await writeCacheIndex(store, merged);
    return merged;
  });
}

export async function runStoreExclusive<T>(
  store: PackFileStore,
  lockKey: string,
  task: () => Promise<T>,
): Promise<T> {
  if (store.runExclusive) {
    return store.runExclusive(lockKey, task);
  }
  let byKey = exclusiveChains.get(store);
  if (!byKey) {
    byKey = new Map();
    exclusiveChains.set(store, byKey);
  }
  const previous = byKey.get(lockKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => task());
  byKey.set(
    lockKey,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export async function isEntryCached(
  store: PackFileStore,
  entry: CacheIndexEntry,
): Promise<boolean> {
  if (entry.relativeFile.length === 0) return false;
  try {
    return await store.exists(entry.relativeFile);
  } catch {
    return false;
  }
}

/**
 * True when every listed assetKey is present in the cache index and on disk.
 * A different atlas version uses a different directory — changing version
 * therefore forces a fetch (empty / missing index for the new version).
 * Cache I/O errors return false (caller may still use bundled fallback).
 */
export async function areKeysCached(
  store: PackFileStore,
  version: string,
  assetKeys: readonly string[],
): Promise<boolean> {
  if (assetKeys.length === 0) return true;
  try {
    const index = await readCacheIndex(store, version);
    if (!index) return false;
    for (const key of assetKeys) {
      const entry = index.entries[key];
      if (!entry) return false;
      if (!(await isEntryCached(store, entry))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function inferPartId(path: string): string | null {
  const m = /^parts\/([^/]+)\//.exec(path);
  return m ? m[1]! : null;
}

function inferRole(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}
