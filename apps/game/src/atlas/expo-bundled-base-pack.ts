import { Asset } from 'expo-asset';
import { createUriMapBundledBasePack } from './bundled-base-pack';
import type { BaseAudioRole, BundledBasePack } from './types';

/**
 * Wire Metro-bundled base-pack placeholders via expo-asset.
 * Catalogue part packs must never be required() here.
 *
 * Note: native device verification of Asset.fromModule URIs remains open in
 * environments without iOS/Android runtimes; unit tests use URI maps instead.
 */
export async function createExpoBundledBasePack(): Promise<BundledBasePack> {
  // Metro resolves these as assets when assetExts includes m4a.
  // Placeholder bytes match supabase/seed/atlas/v1/base/audio/.
  const modules: Record<BaseAudioRole, number> = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    uiTap: require('../../assets/atlas/base/audio/ui-tap.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    musicLoop: require('../../assets/atlas/base/audio/music-loop.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hit: require('../../assets/atlas/base/audio/hit.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dodge: require('../../assets/atlas/base/audio/dodge.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    defeat: require('../../assets/atlas/base/audio/defeat.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hush: require('../../assets/atlas/base/audio/hush.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    win: require('../../assets/atlas/base/audio/win.m4a') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    swing: require('../../assets/atlas/base/audio/swing.m4a') as number,
  };

  const uris: Partial<Record<BaseAudioRole, string>> = {};
  for (const role of Object.keys(modules) as BaseAudioRole[]) {
    try {
      const asset = Asset.fromModule(modules[role]);
      await asset.downloadAsync();
      if (asset.localUri) {
        uris[role] = asset.localUri;
      } else if (asset.uri) {
        uris[role] = asset.uri;
      }
    } catch {
      // Missing decode must not block — resolveAudioCue will fall through to silent.
    }
  }

  return createUriMapBundledBasePack(uris);
}
