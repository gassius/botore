import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useFirstRun } from '../first-run/FirstRunContext';
import type { FirstRunRoute } from '../first-run/routes';
import { isDesignCaptureEnabled, parseDesignCaptureUrl } from './captureEnv';
import {
  armDesignCaptureIntentListener,
  peekCaptureIntent,
  readCaptureIntentForShell,
} from './pendingCaptureIntent';
import { loadCaptureIntentFile } from './readCaptureIntentFile';

/**
 * When design-capture mode is enabled, honor `botore://capture/<Route>` deep
 * links (and the CI Documents intent file) so adb/simctl scripts can jump
 * screens without pixel-exact UI automation.
 */
export function useDesignCaptureDeepLink(): void {
  const { goTo, muted, toggleMute, setDemoPaintId, setDemoWeaponId } = useFirstRun();

  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;
    armDesignCaptureIntentListener();

    const applyIntent = (parsed: {
      route: FirstRunRoute | string | null;
      paintId: string | null;
      weaponId: string | null;
      mute: boolean | null;
    }) => {
      if (parsed.route) goTo(parsed.route as FirstRunRoute);
      if (parsed.paintId) setDemoPaintId(parsed.paintId);
      if (parsed.weaponId) setDemoWeaponId(parsed.weaponId);
      if (parsed.mute === true && !muted) toggleMute();
      if (parsed.mute === false && muted) toggleMute();
    };

    const applyUrl = (url: string | null) => {
      if (!url) return;
      applyIntent(parseDesignCaptureUrl(url));
    };

    // Apply anything armed during auth, then the Documents file, then live URLs.
    applyIntent(readCaptureIntentForShell());
    void loadCaptureIntentFile().then((intent) => {
      applyIntent(intent);
      // Re-apply peek in case a warm openurl landed during the file read.
      applyIntent(peekCaptureIntent());
    });

    void Linking.getInitialURL().then(applyUrl);
    const sub = Linking.addEventListener('url', (event) => {
      applyUrl(event.url);
    });
    return () => {
      sub.remove();
    };
  }, [goTo, muted, setDemoPaintId, setDemoWeaponId, toggleMute]);
}
