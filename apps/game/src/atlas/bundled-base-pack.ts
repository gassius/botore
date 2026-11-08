import {
  BASE_AUDIO_ROLES,
  BUNDLED_BASE_AUDIO_PATHS,
  type BaseAudioRole,
  type BundledBasePack,
} from './types';

/**
 * Build a BundledBasePack from an explicit URI map (tests + native wiring).
 * Catalogue / part packs must never appear here — only base roles.
 */
export function createUriMapBundledBasePack(
  uris: Partial<Record<BaseAudioRole, string>>,
): BundledBasePack {
  return {
    roles: BASE_AUDIO_ROLES,
    resolveUri(role) {
      const uri = uris[role];
      return uri && uri.length > 0 ? uri : null;
    },
  };
}

/** Empty base pack — every cue resolves silent unless a part clip is present. */
export function createEmptyBundledBasePack(): BundledBasePack {
  return createUriMapBundledBasePack({});
}

/** Roles that are allowed to ship inside the app bundle. */
export function isBundledBaseAudioPath(packRelativePath: string): boolean {
  return Object.values(BUNDLED_BASE_AUDIO_PATHS).includes(packRelativePath);
}

export function bundledBaseAudioPathForRole(role: BaseAudioRole): string {
  return BUNDLED_BASE_AUDIO_PATHS[role];
}
