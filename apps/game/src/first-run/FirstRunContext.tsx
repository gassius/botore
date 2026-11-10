import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  type DesignCaptureRankingScenario,
  type DesignCaptureSessionFailure,
  readDesignCaptureConfig,
  readDesignCaptureSessionFailure,
} from '../design-capture';
import { peekCaptureIntent } from '../design-capture/pendingCaptureIntent';
import { usePlayerSettings } from '../settings';
import { nextRoute, prevRoute, type FirstRunRoute } from './routes';

export type FirstRunContextValue = {
  route: FirstRunRoute;
  goTo: (route: FirstRunRoute) => void;
  goNext: () => void;
  goBack: () => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  musicEnabled: boolean;
  setMusicEnabled: (enabled: boolean) => void;
  effectsEnabled: boolean;
  setEffectsEnabled: (enabled: boolean) => void;
  /** Effective reduced motion (OS ∪ force override). */
  reducedMotion: boolean;
  forceReducedMotion: boolean;
  setForceReducedMotion: (v: boolean) => void;
  osReducedMotion: boolean;
  settingsHydrated: boolean;
  /**
   * Shell-local demo selection only — NOT F8 confirmed/pending domain.
   * Domain tickets own real pending vs confirmed loadout + server save.
   */
  demoPaintId: string;
  demoWeaponId: string;
  setDemoPaintId: (id: string) => void;
  setDemoWeaponId: (id: string) => void;
  demoOpponentId: string | null;
  setDemoOpponentId: (id: string | null) => void;
  /** Design-capture Ranking empty/error/live override (C5). */
  rankingCaptureScenario: DesignCaptureRankingScenario | null;
  setRankingCaptureScenario: (scenario: DesignCaptureRankingScenario | null) => void;
  /**
   * C10 design-capture: live offline / auth-expired override.
   * Replaced (or cleared) on every capture deep link — never sticky across stills.
   */
  sessionFailureCapture: DesignCaptureSessionFailure | null;
  setSessionFailureCapture: (failure: DesignCaptureSessionFailure | null) => void;
};

/** Exported so design-capture session-failure can read live overrides without a hard throw. */
export const FirstRunContext = createContext<FirstRunContextValue | null>(null);

function initialCaptureRoute(): FirstRunRoute {
  // Prefer deep-link / CI intent captured during auth over the baked env default.
  return peekCaptureIntent().route ?? readDesignCaptureConfig().initialRoute ?? 'Stable';
}

export function FirstRunProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const captureBoot = readDesignCaptureConfig();
  const pending = peekCaptureIntent();
  const [route, setRoute] = useState<FirstRunRoute>(initialCaptureRoute);
  const settings = usePlayerSettings();
  const [demoPaintId, setDemoPaintId] = useState(
    pending.paintId ?? captureBoot.initialPaintId ?? 'oxide',
  );
  const [demoWeaponId, setDemoWeaponId] = useState(
    pending.weaponId ?? captureBoot.initialWeaponId ?? 'sword',
  );
  const [demoOpponentId, setDemoOpponentId] = useState<string | null>(null);
  const [rankingCaptureScenario, setRankingCaptureScenario] =
    useState<DesignCaptureRankingScenario | null>(null);
  const [sessionFailureCapture, setSessionFailureCapture] =
    useState<DesignCaptureSessionFailure | null>(
      () => pending.sessionFailure ?? readDesignCaptureSessionFailure(),
    );

  const value = useMemo<FirstRunContextValue>(
    () => ({
      route,
      goTo: setRoute,
      goNext: () => {
        const n = nextRoute(route);
        if (n) setRoute(n);
      },
      goBack: () => {
        // Settings is side-entry — Back always returns to Stable chrome.
        if (route === 'Settings') {
          setRoute('Stable');
          return;
        }
        const p = prevRoute(route);
        if (p) setRoute(p);
      },
      muted: settings.muted,
      setMuted: settings.setMuted,
      toggleMute: settings.toggleMute,
      musicEnabled: settings.musicEnabled,
      setMusicEnabled: settings.setMusicEnabled,
      effectsEnabled: settings.effectsEnabled,
      setEffectsEnabled: settings.setEffectsEnabled,
      reducedMotion: settings.reducedMotion,
      forceReducedMotion: settings.forceReducedMotion,
      setForceReducedMotion: settings.setForceReducedMotion,
      osReducedMotion: settings.osReducedMotion,
      settingsHydrated: settings.hydrated,
      demoPaintId,
      demoWeaponId,
      setDemoPaintId,
      setDemoWeaponId,
      demoOpponentId,
      setDemoOpponentId,
      rankingCaptureScenario,
      setRankingCaptureScenario,
      sessionFailureCapture,
      setSessionFailureCapture,
    }),
    [
      route,
      settings.muted,
      settings.setMuted,
      settings.toggleMute,
      settings.musicEnabled,
      settings.setMusicEnabled,
      settings.effectsEnabled,
      settings.setEffectsEnabled,
      settings.reducedMotion,
      settings.forceReducedMotion,
      settings.setForceReducedMotion,
      settings.osReducedMotion,
      settings.hydrated,
      demoPaintId,
      demoWeaponId,
      demoOpponentId,
      rankingCaptureScenario,
      sessionFailureCapture,
    ],
  );

  return <FirstRunContext.Provider value={value}>{children}</FirstRunContext.Provider>;
}

export function useFirstRun(): FirstRunContextValue {
  const ctx = useContext(FirstRunContext);
  if (!ctx) {
    throw new Error('useFirstRun must be used within FirstRunProvider');
  }
  return ctx;
}
