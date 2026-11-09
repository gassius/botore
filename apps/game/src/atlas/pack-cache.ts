import type { CacheIndex, CacheIndexEntry, PackFileStore } from './types';

const INDEX_NAME = 'index.json';

/**
 * Cross-instance exclusive chains keyed by canonical cache root + lock key.
 * Separate PackFileStore handles that share a physical cache directory must
 * serialize through this map — per-instance mutexes are not enough.
 */
const rootExclusiveChains = new Map<string, Promise<unknown>>();

export function cacheDirForVersion(version: string): string {
  return `packs/${version}`;
}

export function cacheIndexPath(version: string): string {
  return `${cacheDirForVersion(version)}/${INDEX_NAME}`;
}

export function cacheIndexTmpPath(version: string): string {
  return `${cacheIndexPath(version)}.tmp`;
}

export function cacheFilePath(version: string, packRelativePath: string): string {
  return `${cacheDirForVersion(version)}/files/${packRelativePath}`;
}

/** Canonicalize store.rootUri so shared directories share one lock namespace. */
export function canonicalCacheRoot(rootUri: string): string {
  return rootUri.replace(/\/+$/, '') || rootUri;
}

export async function readCacheIndex(
  store: PackFileStore,
  version: string,
): Promise<CacheIndex | null> {
  const finalPath = cacheIndexPath(version);
  const tmpPath = cacheIndexTmpPath(version);

  const fromFinal = await tryParseIndexFile(store, finalPath, version);
  if (fromFinal) return fromFinal;

  // Process-restart recovery: a complete staged tmp can outlive a torn/missing final.
  const fromTmp = await tryParseIndexFile(store, tmpPath, version);
  if (!fromTmp) return null;

  try {
    await store.replaceFile(tmpPath, finalPath);
  } catch {
    // Still return the parsed staged index for this process even if promote fails.
  }
  return fromTmp;
}

async function tryParseIndexFile(
  store: PackFileStore,
  path: string,
  version: string,
): Promise<CacheIndex | null> {
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
 * Stage the index to `.tmp`, then atomically replace the final path.
 * Never opens/truncates the live index for in-place writes — a failed
 * replace leaves the previous final (and the staged tmp) readable.
 */
export async function writeCacheIndex(store: PackFileStore, index: CacheIndex): Promise<void> {
  const dir = cacheDirForVersion(index.version);
  const finalPath = cacheIndexPath(index.version);
  const tmpPath = cacheIndexTmpPath(index.version);
  await store.ensureDir(dir);
  const payload = JSON.stringify(index);
  await store.writeText(tmpPath, payload);
  await store.replaceFile(tmpPath, finalPath);
}

/**
 * Merge `newEntries` into the on-disk index under a root-keyed exclusive lock,
 * so concurrent same-version loads across separate store handles retain each
 * other's discoverability.
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
  const fullKey = `${canonicalCacheRoot(store.rootUri)}::${lockKey}`;
  const previous = rootExclusiveChains.get(fullKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => task());
  rootExclusiveChains.set(
    fullKey,
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
