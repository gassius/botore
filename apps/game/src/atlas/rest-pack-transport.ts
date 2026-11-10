/**
 * PackTransport over PostgREST + Storage HTTP — no `@supabase/*` in apps/game.
 * Uses the caller JWT (or anon) for `get_atlas_manifest` and object download.
 */

import type { AtlasManifestResponse } from '@botore/contracts';
import type { PackTransport } from './types';

export type RestPackTransportConfig = {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Returns the current user JWT, or null to fall back to the anon key. */
  readonly getAccessToken: () => Promise<string | null>;
};

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Structural check — avoid pulling `@sinclair/typebox` into the game graph. */
function asPublishedManifest(json: unknown, version: string): AtlasManifestResponse {
  if (!json || typeof json !== 'object') {
    throw new Error(`atlas_manifest_schema_invalid:${version}`);
  }
  const body = json as Record<string, unknown>;
  if (body.ok !== true) {
    const code = typeof body.code === 'string' ? body.code : 'atlas_manifest_rejected';
    throw new Error(`atlas_manifest_unavailable:${version}:${code}`);
  }
  if (
    body.status !== 'published' ||
    typeof body.version !== 'string' ||
    body.bucket !== 'atlas' ||
    !Array.isArray(body.entries) ||
    body.budgetsFinal !== false
  ) {
    throw new Error(`atlas_manifest_schema_invalid:${version}`);
  }
  return body as AtlasManifestResponse;
}

export function createRestPackTransport(config: RestPackTransportConfig): PackTransport {
  const base = trimSlash(config.supabaseUrl);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = (await config.getAccessToken()) ?? config.anonKey;
    return {
      Authorization: `Bearer ${token}`,
      apikey: config.anonKey,
    };
  }

  return {
    async fetchManifest(version: string): Promise<AtlasManifestResponse> {
      const res = await fetch(`${base}/rest/v1/rpc/get_atlas_manifest`, {
        method: 'POST',
        headers: {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ p_version: version }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`atlas_manifest_http_${res.status}:${body.slice(0, 200)}`);
      }
      return asPublishedManifest(await res.json(), version);
    },

    async downloadObject(storagePath: string): Promise<Uint8Array> {
      const objectPath = storagePath.replace(/^\/+/, '');
      const headers = await authHeaders();
      const urls = [
        `${base}/storage/v1/object/authenticated/atlas/${objectPath}`,
        `${base}/storage/v1/object/atlas/${objectPath}`,
      ];
      let lastStatus = 0;
      for (const url of urls) {
        const res = await fetch(url, { headers });
        lastStatus = res.status;
        if (res.ok) {
          return new Uint8Array(await res.arrayBuffer());
        }
      }
      throw new Error(`atlas_download_http_${lastStatus}:${objectPath}`);
    },
  };
}
