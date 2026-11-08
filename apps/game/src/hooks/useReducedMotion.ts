import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export type ReducedMotionControls = {
  reducedMotion: boolean;
  /** Manual override for demo / settings (does not clear OS preference). */
  forceReducedMotion: boolean;
  setForceReducedMotion: (value: boolean) => void;
};

/** Expose OS reduce-motion + optional shell override for replay integration. */
export function useReducedMotion(): ReducedMotionControls {
  const [osReduced, setOsReduced] = useState(false);
  const [forceReducedMotion, setForceReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setOsReduced(Boolean(enabled));
      })
      .catch(() => {
        /* web / unsupported */
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setOsReduced(Boolean(enabled));
    });

    return () => {
      mounted = false;
      // RN 0.76 subscription shape
      if (sub && typeof (sub as { remove?: () => void }).remove === 'function') {
        (sub as { remove: () => void }).remove();
      }
    };
  }, []);

  return {
    reducedMotion: osReduced || forceReducedMotion,
    forceReducedMotion,
    setForceReducedMotion,
  };
}
