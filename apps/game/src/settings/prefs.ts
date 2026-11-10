/**
 * Player settings persisted across launches (C9).
 * Master mute + channel toggles + reduced-motion override.
 * OS reduce-motion is always OR'd in at runtime — never cleared by prefs.
 */

export type PlayerSettingsPrefs = {
  readonly muted: boolean;
  readonly musicEnabled: boolean;
  readonly effectsEnabled: boolean;
  /** Manual override; effective reduced motion = OS ∪ this flag. */
  readonly forceReducedMotion: boolean;
};

export const DEFAULT_PLAYER_SETTINGS: PlayerSettingsPrefs = {
  muted: false,
  musicEnabled: true,
  effectsEnabled: true,
  forceReducedMotion: false,
};

export const PLAYER_SETTINGS_FILENAME = 'botore-player-settings.json';

export function normalizePlayerSettings(raw: unknown): PlayerSettingsPrefs {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PLAYER_SETTINGS };
  }
  const o = raw as Record<string, unknown>;
  return {
    muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_PLAYER_SETTINGS.muted,
    musicEnabled:
      typeof o.musicEnabled === 'boolean' ? o.musicEnabled : DEFAULT_PLAYER_SETTINGS.musicEnabled,
    effectsEnabled:
      typeof o.effectsEnabled === 'boolean'
        ? o.effectsEnabled
        : DEFAULT_PLAYER_SETTINGS.effectsEnabled,
    forceReducedMotion:
      typeof o.forceReducedMotion === 'boolean'
        ? o.forceReducedMotion
        : DEFAULT_PLAYER_SETTINGS.forceReducedMotion,
  };
}

export function mergePlayerSettings(
  base: PlayerSettingsPrefs,
  patch: Partial<PlayerSettingsPrefs>,
): PlayerSettingsPrefs {
  return normalizePlayerSettings({ ...base, ...patch });
}

/** Master mute wins; channel toggles only apply when unmuted. */
export function effectiveMusicMuted(
  prefs: Pick<PlayerSettingsPrefs, 'muted' | 'musicEnabled'>,
): boolean {
  return prefs.muted || !prefs.musicEnabled;
}

export function effectiveEffectsMuted(
  prefs: Pick<PlayerSettingsPrefs, 'muted' | 'effectsEnabled'>,
): boolean {
  return prefs.muted || !prefs.effectsEnabled;
}
