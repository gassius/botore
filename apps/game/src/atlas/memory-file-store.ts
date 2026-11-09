import type { PackFileStore } from './types';

type MemoryBackend = {
  files: Map<string, Uint8Array | string>;
  dirs: Set<string>;
};

/** Shared backends keyed by canonical rootUri so separate store handles share files. */
const sharedBackends = new Map<string, MemoryBackend>();

function canonicalizeRoot(rootUri: string): string {
  return rootUri.replace(/\/+$/, '') || rootUri;
}

/**
 * In-memory PackFileStore for unit tests and web-preview fallback.
 * Not a substitute for native documentDirectory caching on device.
 *
 * Handles created with the same `rootUri` share one backend (files + dirs) so
 * concurrent loader/store instances can exercise the shared-cache contract.
 */
export function createMemoryPackFileStore(rootUri = 'memory://atlas-cache/'): PackFileStore {
  const rootKey = canonicalizeRoot(rootUri);
  let backend = sharedBackends.get(rootKey);
  if (!backend) {
    backend = { files: new Map(), dirs: new Set<string>(['']) };
    sharedBackends.set(rootKey, backend);
  }
  const { files, dirs } = backend;

  const normalize = (relativePath: string): string =>
    relativePath.replace(/^\/+/, '').replace(/\/+$/, '');

  const store: PackFileStore = {
    rootUri: rootKey.endsWith('/') ? rootKey : `${rootKey}/`,
    async exists(relativePath) {
      const key = normalize(relativePath);
      return files.has(key) || dirs.has(key);
    },
    async readText(relativePath) {
      const key = normalize(relativePath);
      const value = files.get(key);
      if (value === undefined) {
        throw new Error(`memory-store missing: ${key}`);
      }
      if (typeof value === 'string') return value;
      let text = '';
      for (let i = 0; i < value.length; i += 1) {
        text += String.fromCharCode(value[i]!);
      }
      return text;
    },
    async writeText(relativePath, contents) {
      const key = normalize(relativePath);
      await store.ensureDir(key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '');
      files.set(key, contents);
    },
    async writeBytes(relativePath, data) {
      const key = normalize(relativePath);
      await store.ensureDir(key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '');
      files.set(key, data);
    },
    async ensureDir(relativePath) {
      const key = normalize(relativePath);
      if (!key) {
        dirs.add('');
        return;
      }
      const parts = key.split('/');
      let cur = '';
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        dirs.add(cur);
      }
    },
    uriFor(relativePath) {
      return `${store.rootUri}${normalize(relativePath)}`;
    },
    async replaceFile(fromRelativePath, toRelativePath) {
      const from = normalize(fromRelativePath);
      const to = normalize(toRelativePath);
      if (!files.has(from)) {
        throw new Error(`memory-store replace missing source: ${from}`);
      }
      // Single-turn publish: destination flips to the staged bytes without an
      // intermediate empty/truncated destination visible to other readers.
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    async remove(relativePath) {
      const key = normalize(relativePath);
      files.delete(key);
    },
  };

  return store;
}

/** Test helper: drop a shared memory backend (does not affect other roots). */
export function resetMemoryPackFileStore(rootUri = 'memory://atlas-cache/'): void {
  sharedBackends.delete(canonicalizeRoot(rootUri));
}
