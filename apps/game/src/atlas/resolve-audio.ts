import type { BaseAudioRole, BundledBasePack, ResolvedAudioCue, ResolvedAsset } from './types';

/**
 * Resolve a fight audio cue without ever blocking playback.
 *
 * Preference order (docs/audio/README.md):
 * 1. Preferred part / downloaded clip when a local URI exists
 * 2. Bundled base-pack role
 * 3. Silent (null URI) — fight continues
 */
export function resolveAudioCue(input: {
  role: BaseAudioRole;
  preferredLocalUri?: string | null;
  bundled: BundledBasePack;
}): ResolvedAudioCue {
  const preferred = input.preferredLocalUri;
  if (preferred && preferred.length > 0) {
    return { uri: preferred, source: 'part', role: input.role };
  }

  const baseUri = input.bundled.resolveUri(input.role);
  if (baseUri && baseUri.length > 0) {
    return { uri: baseUri, source: 'base', role: input.role };
  }

  return { uri: null, source: 'silent', role: input.role };
}

/**
 * Map a combat-ish trigger to a base role, then resolve.
 * Missing / failed audio never throws.
 */
export function resolveTriggerAudio(input: {
  trigger:
    | 'ui_tap'
    | 'music_loop'
    | 'hush'
    | 'attack_selected'
    | 'damage_applied'
    | 'dodged'
    | 'character_defeated'
    | 'battle_ended_win';
  partAudioUri?: string | null;
  bundled: BundledBasePack;
}): ResolvedAudioCue {
  const role = triggerToBaseRole(input.trigger);
  try {
    return resolveAudioCue({
      role,
      preferredLocalUri: input.partAudioUri ?? null,
      bundled: input.bundled,
    });
  } catch {
    return { uri: null, source: 'silent', role };
  }
}

export function triggerToBaseRole(
  trigger:
    | 'ui_tap'
    | 'music_loop'
    | 'hush'
    | 'attack_selected'
    | 'damage_applied'
    | 'dodged'
    | 'character_defeated'
    | 'battle_ended_win',
): BaseAudioRole {
  switch (trigger) {
    case 'ui_tap':
      return 'uiTap';
    case 'music_loop':
      return 'musicLoop';
    case 'hush':
      return 'hush';
    case 'attack_selected':
      return 'swing';
    case 'damage_applied':
      return 'hit';
    case 'dodged':
      return 'dodge';
    case 'character_defeated':
      return 'defeat';
    case 'battle_ended_win':
      return 'win';
  }
}

/** Find the first cached/downloaded audio asset for a part id (if any). */
export function findPartAudioUri(assets: readonly ResolvedAsset[], partId: string): string | null {
  for (const asset of assets) {
    if (asset.partId === partId && asset.kind === 'audio' && asset.localUri) {
      return asset.localUri;
    }
  }
  return null;
}
