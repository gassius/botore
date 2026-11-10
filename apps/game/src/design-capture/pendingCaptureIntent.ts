import { Linking } from 'react-native';
import { isDesignCaptureEnabled, parseDesignCaptureUrl } from './captureEnv';
import {
  consumeCaptureRoute,
  mergeCaptureFileIntent,
  mergeIntent,
  peekCaptureIntent,
  resetCaptureIntentForTests,
  type CaptureIntent,
} from './captureIntentState';

export type { CaptureIntent };
export {
  consumeCaptureRoute,
  mergeCaptureFileIntent,
  peekCaptureIntent,
  resetCaptureIntentForTests,
};

/**
 * Capture deep-link / file intent that arrives before FirstRunShell mounts
 * (auth gate). iOS Simulator often delivers `getInitialURL` during Garage
 * boot; reading it only inside the shell left every still on Stable.
 */

let listening = false;

function applyUrl(url: string | null): void {
  if (!url) return;
  const parsed = parseDesignCaptureUrl(url);
  mergeIntent({
    route: parsed.route,
    paintId: parsed.paintId,
    weaponId: parsed.weaponId,
    mute: parsed.mute,
    battleId: null,
    rankingScenario: parsed.rankingScenario,
    failClosed: parsed.failClosed,
  });
}

/** Start listening as early as App/GarageRoot mounts (idempotent). */
export function armDesignCaptureIntentListener(): void {
  if (!isDesignCaptureEnabled() || listening) return;
  listening = true;
  void Linking.getInitialURL().then(applyUrl);
  // App-lifetime subscription — capture builds only; no teardown needed.
  Linking.addEventListener('url', (event) => {
    applyUrl(event.url);
  });
  // Retry getInitialURL — iOS sometimes populates it after the first tick.
  void (async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const url = await Linking.getInitialURL();
      if (url) applyUrl(url);
      if (peekCaptureIntent().route) return;
    }
  })();
}
