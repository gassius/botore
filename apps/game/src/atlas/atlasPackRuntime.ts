/**
 * Best-effort atlas pack session for Stable / Fight (C13).
 *
 * Expo store + bundled base are loaded lazily so headless vitest that only
 * imports session contexts does not pull Metro asset requires until needed.
 * Failures never block hydration or fights — Metro kit remains the render path
 * until Storage is available; this teaches the long-term download/cache path.
 */

import type { SupabasePublicConfig } from '../garage/auth/supabasePublicConfig';
import { AtlasPackLoader } from './pack-loader';
import { createRestPackTransport } from './rest-pack-transport';
import {
  defaultAtlasVersionForWorkshopFrame,
  ensureStableFightPacks,
  type StableFightLoadoutSlots,
} from './ensure-stable-fight-packs';
import type { EnsurePacksResult } from './types';

export type EnsureRuntimePacksArgs = {
  readonly config: SupabasePublicConfig | null;
  readonly accessToken: string | null;
  readonly atlasVersion: string | null | undefined;
  readonly loadouts: readonly StableFightLoadoutSlots[];
  readonly includeArena?: boolean;
  readonly includeFx?: boolean;
};

/**
 * Ensure packs for stable/fight bots. Returns null when Supabase is unset or
 * the native cache/base pack cannot be constructed — callers must not treat
 * null as a fight blocker.
 */
export async function ensureRuntimePacksBestEffort(
  args: EnsureRuntimePacksArgs,
): Promise<EnsurePacksResult | null> {
  if (!args.config) return null;
  if (!args.loadouts.length) return null;

  const config = args.config;
  const token = args.accessToken;
  try {
    const transport = createRestPackTransport({
      supabaseUrl: config.url,
      anonKey: config.anonKey,
      getAccessToken: async () => token,
    });
    const [{ createExpoPackFileStore }, { createExpoBundledBasePack }] = await Promise.all([
      import('./expo-pack-store'),
      import('./expo-bundled-base-pack'),
    ]);
    const store = await createExpoPackFileStore();
    const bundledBase = await createExpoBundledBasePack();
    // Cache root is documentDirectory — warm same-version hits survive across calls.
    const loader = new AtlasPackLoader({ transport, store, bundledBase });

    return await ensureStableFightPacks({
      atlasVersion: defaultAtlasVersionForWorkshopFrame(args.atlasVersion),
      loadouts: args.loadouts,
      transport,
      loader,
      allowOffline: true,
      ...(args.includeArena !== undefined ? { includeArena: args.includeArena } : {}),
      ...(args.includeFx !== undefined ? { includeFx: args.includeFx } : {}),
    });
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[atlas] ensurePacks skipped:',
        err instanceof Error ? err.message : String(err),
      );
    }
    return null;
  }
}
