import { Linking } from 'react-native';
import type { FirstRunRoute } from '../first-run/routes';
import { isFirstRunRoute } from '../first-run/routes';
import {
  type DesignCaptureRankingScenario,
  isDesignCaptureEnabled,
  parseDesignCaptureRankingScenario,
  parseDesignCaptureUrl,
} from './captureEnv';

/**
 * Capture deep-link / file intent that arrives before FirstRunShell mounts
 * (auth gate). iOS Simulator often delivers `getInitialURL` during Garage
 * boot; reading it only inside the shell left every still on Stable.
 */

export type CaptureIntent = {
  route: FirstRunRoute | null;
  paintId: string | null;
  weaponId: string | null;
  mute: boolean | null;
  rankingScenario: DesignCaptureRankingScenario | null;
};

const EMPTY: CaptureIntent = {
  route: null,
  paintId: null,
  weaponId: null,
  mute: null,
  rankingScenario: null,
};

let intent: CaptureIntent = { ...EMPTY };
let listening = false;
let sub: { remove: () => void } | null = null;

function mergeIntent(next: CaptureIntent): void {
  intent = {
    route: next.route ?? intent.route,
    paintId: next.paintId ?? intent.paintId,
    weaponId: next.weaponId ?? intent.weaponId,
    mute: next.mute ?? intent.mute,
    rankingScenario: next.rankingScenario ?? intent.rankingScenario,
  };
}

function applyUrl(url: string | null): void {
  if (!url) return;
  const parsed = parseDesignCaptureUrl(url);
  mergeIntent({
    route: parsed.route,
    paintId: parsed.paintId,
    weaponId: parsed.weaponId,
    mute: parsed.mute,
    rankingScenario: parsed.rankingScenario,
  });
}

/** Start listening as early as App/GarageRoot mounts (idempotent). */
export function armDesignCaptureIntentListener(): void {
  if (!isDesignCaptureEnabled() || listening) return;
  listening = true;
  void Linking.getInitialURL().then(applyUrl);
  sub = Linking.addEventListener('url', (event) => {
    applyUrl(event.url);
  });
  // Retry getInitialURL — iOS sometimes populates it after the first tick.
  void (async () => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const url = await Linking.getInitialURL();
      if (url) applyUrl(url);
      if (intent.route) return;
    }
  })();
}

/** Merge a Documents-file override written by CI (`botore-design-capture-intent.json`). */
export function mergeCaptureFileIntent(raw: {
  route?: string | null;
  paintId?: string | null;
  weaponId?: string | null;
  mute?: boolean | null;
  rankingScenario?: string | null;
  ranking?: string | null;
}): void {
  const route = typeof raw.route === 'string' && isFirstRunRoute(raw.route) ? raw.route : null;
  mergeIntent({
    route,
    paintId: typeof raw.paintId === 'string' && raw.paintId.trim() ? raw.paintId.trim() : null,
    weaponId: typeof raw.weaponId === 'string' && raw.weaponId.trim() ? raw.weaponId.trim() : null,
    mute: typeof raw.mute === 'boolean' ? raw.mute : null,
    rankingScenario: parseDesignCaptureRankingScenario(
      raw.rankingScenario ?? raw.ranking ?? undefined,
    ),
  });
}

export function peekCaptureIntent(): CaptureIntent {
  return { ...intent };
}

/** Snapshot + clear route so the next cold start does not reuse it. */
export function consumeCaptureRoute(): FirstRunRoute | null {
  const route = intent.route;
  intent = { ...intent, route: null };
  return route;
}

export function readCaptureIntentForShell(): CaptureIntent {
  return { ...intent };
}

export function stopDesignCaptureIntentListener(): void {
  sub?.remove();
  sub = null;
  listening = false;
}
