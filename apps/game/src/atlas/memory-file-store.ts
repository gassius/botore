import type { PackFileStore } from './types';

/**
 * In-memory PackFileStore for unit tests and web-preview fallback.
 * Not a substitute for native documentDirectory caching on device.
 */
export function createMemoryPackFileStore(rootUri = 'memory://atlas-cache/'): PackFileStore {
  const files = new Map<string, Uint8Array | string>();
  const dirs = new Set<string>(['']);

  const normalize = (relativePath: string): string =>
    relativePath.replace(/^\/+/, '').replace(/\/+$/, '');

  return {
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
      await this.ensureDir(key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '');
      files.set(key, contents);
    },
    async writeBytes(relativePath, data) {
      const key = normalize(relativePath);
      await this.ensureDir(key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '');
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
  };
}
