import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useFirstRun } from '../first-run/FirstRunContext';
import { isDesignCaptureEnabled, parseDesignCaptureUrl } from './captureEnv';

/**
 * When design-capture mode is enabled, honor `botore://capture/<Route>` deep
 * links so adb/simctl scripts can jump screens without pixel-exact UI automation.
 */
export function useDesignCaptureDeepLink(): void {
  const { goTo, muted, toggleMute } = useFirstRun();

  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;

    const applyUrl = (url: string | null) => {
      if (!url) return;
      const parsed = parseDesignCaptureUrl(url);
      if (parsed.route) goTo(parsed.route);
      if (parsed.mute === true && !muted) toggleMute();
      if (parsed.mute === false && muted) toggleMute();
    };

    void Linking.getInitialURL().then(applyUrl);
    const sub = Linking.addEventListener('url', (event) => {
      applyUrl(event.url);
    });
    return () => {
      sub.remove();
    };
  }, [goTo, muted, toggleMute]);
}
