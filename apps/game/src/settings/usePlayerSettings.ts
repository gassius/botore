import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { DEFAULT_PLAYER_SETTINGS, mergePlayerSettings, type PlayerSettingsPrefs } from './prefs';
import { loadPlayerSettings, savePlayerSettings } from './prefsStore';

export type PlayerSettingsControls = {
  prefs: PlayerSettingsPrefs;
  /** True after the first disk load attempt (hit or miss). */
  hydrated: boolean;
  muted: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  /** Effective: OS reduce-motion ∪ force override. */
  reducedMotion: boolean;
  forceReducedMotion: boolean;
  osReducedMotion: boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setMusicEnabled: (enabled: boolean) => void;
  setEffectsEnabled: (enabled: boolean) => void;
  setForceReducedMotion: (forced: boolean) => void;
};

/**
 * Shell-level player settings with DocumentDirectory persistence.
 * Kill/relaunch retains mute + channel toggles + force reduced-motion.
 */
export function usePlayerSettings(): PlayerSettingsControls {
  const [prefs, setPrefs] = useState<PlayerSettingsPrefs>({ ...DEFAULT_PLAYER_SETTINGS });
  const [hydrated, setHydrated] = useState(false);
  const [osReducedMotion, setOsReducedMotion] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  /** True once the user/capture mutates prefs — skip stale disk overwrite. */
  const dirtyRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void loadPlayerSettings().then((loaded) => {
      if (!mounted) return;
      if (!dirtyRef.current) {
        prefsRef.current = loaded;
        setPrefs(loaded);
      }
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setOsReducedMotion(Boolean(enabled));
      })
      .catch(() => {
        /* web / unsupported */
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setOsReducedMotion(Boolean(enabled));
    });

    return () => {
      mounted = false;
      if (sub && typeof (sub as { remove?: () => void }).remove === 'function') {
        (sub as { remove: () => void }).remove();
      }
    };
  }, []);

  const commit = useCallback((patch: Partial<PlayerSettingsPrefs>) => {
    dirtyRef.current = true;
    const next = mergePlayerSettings(prefsRef.current, patch);
    prefsRef.current = next;
    setPrefs(next);
    void savePlayerSettings(next);
  }, []);

  const setMuted = useCallback(
    (muted: boolean) => {
      commit({ muted: Boolean(muted) });
    },
    [commit],
  );

  const toggleMute = useCallback(() => {
    commit({ muted: !prefsRef.current.muted });
  }, [commit]);

  const setMusicEnabled = useCallback(
    (enabled: boolean) => {
      commit({ musicEnabled: Boolean(enabled) });
    },
    [commit],
  );

  const setEffectsEnabled = useCallback(
    (enabled: boolean) => {
      commit({ effectsEnabled: Boolean(enabled) });
    },
    [commit],
  );

  const setForceReducedMotion = useCallback(
    (forced: boolean) => {
      commit({ forceReducedMotion: Boolean(forced) });
    },
    [commit],
  );

  return {
    prefs,
    hydrated,
    muted: prefs.muted,
    musicEnabled: prefs.musicEnabled,
    effectsEnabled: prefs.effectsEnabled,
    forceReducedMotion: prefs.forceReducedMotion,
    osReducedMotion,
    reducedMotion: osReducedMotion || prefs.forceReducedMotion,
    setMuted,
    toggleMute,
    setMusicEnabled,
    setEffectsEnabled,
    setForceReducedMotion,
  };
}
