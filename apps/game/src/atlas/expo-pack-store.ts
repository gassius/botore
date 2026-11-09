import type { PackFileStore } from './types';
import { createMemoryPackFileStore } from './memory-file-store';

type ExpoFileSystemModule = {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  getInfoAsync: (
    fileUri: string,
    options?: { md5?: boolean; size?: boolean },
  ) => Promise<{ exists: boolean; isDirectory?: boolean }>;
  makeDirectoryAsync: (fileUri: string, options?: { intermediates?: boolean }) => Promise<void>;
  readAsStringAsync: (fileUri: string) => Promise<string>;
  writeAsStringAsync: (
    fileUri: string,
    contents: string,
    options?: { encoding?: string },
  ) => Promise<void>;
  moveAsync: (options: { from: string; to: string }) => Promise<void>;
  deleteAsync?: (fileUri: string, options?: { idempotent?: boolean }) => Promise<void>;
  EncodingType?: { Base64: string; UTF8: string };
};

/**
 * Native documentDirectory-backed cache store (Android / iOS).
 * Falls back to an in-memory store when documentDirectory is unavailable
 * (typical for web preview — not acceptance).
 *
 * Uses the classic `expo-file-system` API (SDK 52). Prefer this over the
 * beta `expo-file-system/next` entry until the client upgrades past SDK 52.
 *
 * Index publication uses `replaceFile` → `moveAsync` (never truncating
 * `writeAsStringAsync` on the live index). Same-version commit serialization
 * is root-keyed in `pack-cache` so separate store handles sharing this
 * directory still cooperate.
 */
export async function createExpoPackFileStore(subdir = 'atlas-cache'): Promise<PackFileStore> {
  let FileSystem: ExpoFileSystemModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    FileSystem = require('expo-file-system') as ExpoFileSystemModule;
  } catch {
    return createMemoryPackFileStore('memory://atlas-cache-no-native/');
  }

  const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!root) {
    return createMemoryPackFileStore('memory://atlas-cache-web-preview/');
  }

  const rootUri = root.endsWith('/') ? `${root}${subdir}/` : `${root}/${subdir}/`;
  await FileSystem.makeDirectoryAsync(rootUri, { intermediates: true });

  const toUri = (relativePath: string): string => {
    const cleaned = relativePath.replace(/^\/+/, '');
    return `${rootUri}${cleaned}`;
  };

  return {
    rootUri,
    async exists(relativePath) {
      const info = await FileSystem.getInfoAsync(toUri(relativePath));
      return info.exists;
    },
    async readText(relativePath) {
      return FileSystem.readAsStringAsync(toUri(relativePath));
    },
    async writeText(relativePath, contents) {
      const uri = toUri(relativePath);
      const parent = uri.slice(0, uri.lastIndexOf('/') + 1);
      await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
      await FileSystem.writeAsStringAsync(uri, contents);
    },
    async writeBytes(relativePath, data) {
      const uri = toUri(relativePath);
      const parent = uri.slice(0, uri.lastIndexOf('/') + 1);
      await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
      // Classic API: write base64 payload (UTF8 would corrupt binary).
      const base64 = uint8ToBase64(data);
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType?.Base64 ?? 'base64',
      });
    },
    async ensureDir(relativePath) {
      const uri = toUri(relativePath);
      await FileSystem.makeDirectoryAsync(uri.endsWith('/') ? uri : `${uri}/`, {
        intermediates: true,
      });
    },
    uriFor(relativePath) {
      return toUri(relativePath);
    },
    async replaceFile(fromRelativePath, toRelativePath) {
      const fromUri = toUri(fromRelativePath);
      const toFileUri = toUri(toRelativePath);
      const destInfo = await FileSystem.getInfoAsync(toFileUri);
      if (!destInfo.exists) {
        await FileSystem.moveAsync({ from: fromUri, to: toFileUri });
        return;
      }
      // Move live index aside, then promote staged file. On promote failure,
      // restore the previous final so readers never keep a truncated path.
      const bakUri = `${toFileUri}.bak`;
      if (FileSystem.deleteAsync) {
        await FileSystem.deleteAsync(bakUri, { idempotent: true });
      }
      await FileSystem.moveAsync({ from: toFileUri, to: bakUri });
      try {
        await FileSystem.moveAsync({ from: fromUri, to: toFileUri });
        if (FileSystem.deleteAsync) {
          await FileSystem.deleteAsync(bakUri, { idempotent: true });
        }
      } catch (err) {
        try {
          await FileSystem.moveAsync({ from: bakUri, to: toFileUri });
        } catch {
          // best-effort restore
        }
        throw err;
      }
    },
    async remove(relativePath) {
      if (!FileSystem.deleteAsync) return;
      await FileSystem.deleteAsync(toUri(relativePath), { idempotent: true });
    },
  };
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** RN-safe base64 encoder (avoids Node Buffer / DOM btoa in the game tsconfig). */
function uint8ToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '=';
  }
  return out;
}
