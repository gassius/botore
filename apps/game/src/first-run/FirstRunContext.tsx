import React, { createContext, useContext, useMemo, useState } from 'react';
import { type DesignCaptureRankingScenario, readDesignCaptureConfig } from '../design-capture';
import { peekCaptureIntent } from '../design-capture/pendingCaptureIntent';
import { useMute } from '../hooks/useMute';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { nextRoute, prevRoute, type FirstRunRoute } from './routes';

export type FirstRunContextValue = {
  route: FirstRunRoute;
  goTo: (route: FirstRunRoute) => void;
  goNext: () => void;
  goBack: () => void;
  muted: boolean;
  toggleMute: () => void;
  reducedMotion: boolean;
  forceReducedMotion: boolean;
  setForceReducedMotion: (v: boolean) => void;
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
};

const FirstRunContext = createContext<FirstRunContextValue | null>(null);

function initialCaptureRoute(): FirstRunRoute {
  // Prefer deep-link / CI intent captured during auth over the baked env default.
  return peekCaptureIntent().route ?? readDesignCaptureConfig().initialRoute ?? 'Stable';
}

export function FirstRunProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const captureBoot = readDesignCaptureConfig();
  const pending = peekCaptureIntent();
  const [route, setRoute] = useState<FirstRunRoute>(initialCaptureRoute);
  const { muted, toggleMute } = useMute(false);
  const { reducedMotion, forceReducedMotion, setForceReducedMotion } = useReducedMotion();
  const [demoPaintId, setDemoPaintId] = useState(
    pending.paintId ?? captureBoot.initialPaintId ?? 'oxide',
  );
  const [demoWeaponId, setDemoWeaponId] = useState(
    pending.weaponId ?? captureBoot.initialWeaponId ?? 'sword',
  );
  const [demoOpponentId, setDemoOpponentId] = useState<string | null>(null);
  const [rankingCaptureScenario, setRankingCaptureScenario] =
    useState<DesignCaptureRankingScenario | null>(null);

  const value = useMemo<FirstRunContextValue>(
    () => ({
      route,
      goTo: setRoute,
      goNext: () => {
        const n = nextRoute(route);
        if (n) setRoute(n);
      },
      goBack: () => {
        const p = prevRoute(route);
        if (p) setRoute(p);
      },
      muted,
      toggleMute,
      reducedMotion,
      forceReducedMotion,
      setForceReducedMotion,
      demoPaintId,
      demoWeaponId,
      setDemoPaintId,
      setDemoWeaponId,
      demoOpponentId,
      setDemoOpponentId,
      rankingCaptureScenario,
      setRankingCaptureScenario,
    }),
    [
      route,
      muted,
      toggleMute,
      reducedMotion,
      forceReducedMotion,
      setForceReducedMotion,
      demoPaintId,
      demoWeaponId,
      demoOpponentId,
      rankingCaptureScenario,
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
