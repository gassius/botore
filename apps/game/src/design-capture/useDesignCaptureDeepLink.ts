import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useFirstRun } from '../first-run/FirstRunContext';
import type { FirstRunRoute } from '../first-run/routes';
import {
  type DesignCaptureRankingScenario,
  isDesignCaptureEnabled,
  parseDesignCaptureUrl,
} from './captureEnv';
import {
  armDesignCaptureIntentListener,
  peekCaptureIntent,
  readCaptureIntentForShell,
} from './pendingCaptureIntent';
import { loadCaptureIntentFile } from './readCaptureIntentFile';

/**
 * When design-capture mode is enabled, honor the CI Documents intent file
 * (and any deep link that arrives without SpringBoard's "Open in…?" sheet).
 * iOS Simulator `simctl openurl` for custom schemes often shows that sheet
 * instead of delivering the URL — CI therefore launches via `simctl launch`
 * and plants `botore-design-capture-intent.json`.
 */
export function useDesignCaptureDeepLink(): void {
  const { goTo, muted, toggleMute, setDemoPaintId, setDemoWeaponId, setRankingCaptureScenario } =
    useFirstRun();

  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;
    armDesignCaptureIntentListener();

    const applyIntent = (parsed: {
      route: FirstRunRoute | string | null;
      paintId: string | null;
      weaponId: string | null;
      mute: boolean | null;
      rankingScenario?: DesignCaptureRankingScenario | null;
    }) => {
      // Ranking scenario before route so RankingSlot mounts the right port.
      if (parsed.rankingScenario) {
        setRankingCaptureScenario(parsed.rankingScenario);
      } else if (parsed.route === 'Ranking') {
        setRankingCaptureScenario('live');
      }
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

    applyIntent(readCaptureIntentForShell());

    let cancelled = false;
    void (async () => {
      // Poll the Documents intent file — CI may rewrite it after FirstRunShell mounts.
      for (let i = 0; i < 40 && !cancelled; i++) {
        const intent = await loadCaptureIntentFile();
        if (cancelled) return;
        applyIntent(intent);
        applyIntent(peekCaptureIntent());
        await new Promise((r) => setTimeout(r, 400));
      }
    })();

    void Linking.getInitialURL().then(applyUrl);
    const sub = Linking.addEventListener('url', (event) => {
      applyUrl(event.url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [goTo, muted, setDemoPaintId, setDemoWeaponId, setRankingCaptureScenario, toggleMute]);
}
