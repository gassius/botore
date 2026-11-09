import type { PackFileStore } from './types';

/**
 * In-memory PackFileStore for unit tests and web-preview fallback.
 * Not a substitute for native documentDirectory caching on device.
 */
export function createMemoryPackFileStore(rootUri = 'memory://atlas-cache/'): PackFileStore {
  const files = new Map<string, Uint8Array | string>();
  const dirs = new Set<string>(['']);
  const exclusive = new Map<string, Promise<unknown>>();

  const normalize = (relativePath: string): string =>
    relativePath.replace(/^\/+/, '').replace(/\/+$/, '');

  const store: PackFileStore = {
    rootUri,
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
      return `${rootUri}${normalize(relativePath)}`;
    },
    async remove(relativePath) {
      const key = normalize(relativePath);
      files.delete(key);
    },
    async runExclusive<T>(lockKey: string, task: () => Promise<T>): Promise<T> {
      const previous = exclusive.get(lockKey) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(() => task());
      exclusive.set(
        lockKey,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      return run;
    },
  };

  return store;
}
