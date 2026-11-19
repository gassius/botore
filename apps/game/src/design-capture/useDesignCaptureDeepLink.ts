import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useFirstRun } from '../first-run/FirstRunContext';
import type { FirstRunRoute } from '../first-run/routes';
import type { ResultCaptureScenario } from '../result-overlay/designCaptureRecords';
import {
  type DesignCaptureCustomiseScenario,
  type DesignCaptureFightQuotaScenario,
  type DesignCaptureHomeScenario,
  type DesignCaptureRankingScenario,
  type DesignCaptureSessionFailure,
  isDesignCaptureEnabled,
  parseDesignCaptureUrl,
} from './captureEnv';
import { consumeCaptureRoute, mergeIntent, peekCaptureIntent } from './captureIntentState';
import { armDesignCaptureIntentListener } from './pendingCaptureIntent';
import { consumeCaptureIntentFile, loadCaptureIntentFile } from './readCaptureIntentFile';

/**
 * When design-capture mode is enabled, honor the CI Documents intent file
 * (and any deep link that arrives without SpringBoard's "Open in…?" sheet).
 *
 * Apply each distinct route once. Do not re-apply the same route on a 400 ms
 * poll (C7b PRR P3 — that snapped multi-step captures back). New deep links
 * with a different route (Stable → ConfirmFight → Replay) must still navigate.
 */
export function useDesignCaptureDeepLink(): void {
  const {
    goTo,
    muted,
    setMuted,
    setDemoPaintId,
    setDemoWeaponId,
    setRankingCaptureScenario,
    setSessionFailureCapture,
    setCustomiseCaptureScenario,
    setResultCaptureScenario,
    setHomeCaptureScenario,
    setFightQuotaCaptureScenario,
    setFightViewMode,
  } = useFirstRun();
  const lastAppliedRoute = useRef<FirstRunRoute | null>(null);
  const lastSessionFailure = useRef<DesignCaptureSessionFailure | null | undefined>(undefined);
  const lastCustomiseScenario = useRef<DesignCaptureCustomiseScenario | null | undefined>(
    undefined,
  );
  const lastResultScenario = useRef<ResultCaptureScenario | null | undefined>(undefined);
  const lastHomeScenario = useRef<DesignCaptureHomeScenario | null | undefined>(undefined);
  const lastRankingScenario = useRef<DesignCaptureRankingScenario | null | undefined>(undefined);
  const lastFightQuotaScenario = useRef<DesignCaptureFightQuotaScenario | null | undefined>(
    undefined,
  );
  const fileConsumed = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;
    armDesignCaptureIntentListener();

    const applyPaintWeaponMute = (parsed: {
      paintId: string | null;
      weaponId: string | null;
      mute: boolean | null;
      route?: FirstRunRoute | string | null;
      rankingScenario?: DesignCaptureRankingScenario | null;
      sessionFailure?: DesignCaptureSessionFailure | null;
      fightViewMode?: 'firstWatch' | 'rewatch' | null;
      customiseScenario?: DesignCaptureCustomiseScenario | null;
      resultScenario?: ResultCaptureScenario | null;
      homeScenario?: DesignCaptureHomeScenario | null;
      fightQuotaScenario?: DesignCaptureFightQuotaScenario | null;
    }) => {
      // Always replace live sessionFailure (including null clear) so sequential
      // stills never stick auth_expired into a later offline capture.
      if (parsed.sessionFailure !== lastSessionFailure.current) {
        lastSessionFailure.current = parsed.sessionFailure ?? null;
        setSessionFailureCapture(parsed.sessionFailure ?? null);
      }
      // Same-route Customise stills (paint-clean → dirty → equipped) refresh
      // scenario even when applyRouteIfNew skips goTo.
      if (parsed.customiseScenario !== lastCustomiseScenario.current) {
        lastCustomiseScenario.current = parsed.customiseScenario ?? null;
        setCustomiseCaptureScenario(parsed.customiseScenario ?? null);
      } else if (parsed.route === 'Customise' && parsed.customiseScenario) {
        // Re-assert when stills repeat the same scenario after another route.
        setCustomiseCaptureScenario(parsed.customiseScenario);
      }
      // Same-route FightResult stills (victory → defeat) refresh even when goTo skips.
      if (parsed.resultScenario !== lastResultScenario.current) {
        lastResultScenario.current = parsed.resultScenario ?? null;
        setResultCaptureScenario(parsed.resultScenario ?? null);
      } else if (parsed.route === 'FightResult' && parsed.resultScenario) {
        setResultCaptureScenario(parsed.resultScenario);
      }
      // Ludus More sheet stills — refresh even on same-route Stable captures.
      if (parsed.homeScenario !== lastHomeScenario.current) {
        lastHomeScenario.current = parsed.homeScenario ?? null;
        setHomeCaptureScenario(parsed.homeScenario ?? null);
      } else if (parsed.route === 'Stable' && parsed.homeScenario) {
        setHomeCaptureScenario(parsed.homeScenario);
      } else if (parsed.route === 'Stable' && parsed.homeScenario == null) {
        // Clear sticky More-open when a later garage still omits home=.
        lastHomeScenario.current = null;
        setHomeCaptureScenario(null);
      }
      // Ranking scenario before route so RankingSlot mounts the right port.
      // Same-route stills (bots → botores → empty → loading) refresh even when
      // applyRouteIfNew skips goTo. C10 sessionFailure also drives fixtures.
      if (parsed.rankingScenario !== undefined && parsed.rankingScenario !== null) {
        if (parsed.rankingScenario !== lastRankingScenario.current) {
          lastRankingScenario.current = parsed.rankingScenario;
          setRankingCaptureScenario(parsed.rankingScenario);
        } else if (parsed.route === 'Ranking') {
          setRankingCaptureScenario(parsed.rankingScenario);
        }
      } else if (parsed.sessionFailure === 'offline' || parsed.sessionFailure === 'auth_expired') {
        lastRankingScenario.current = parsed.sessionFailure;
        setRankingCaptureScenario(parsed.sessionFailure);
      } else if (parsed.route === 'Ranking') {
        lastRankingScenario.current = 'live';
        setRankingCaptureScenario('live');
      }
      // D8/D9 fightQuota — same-route Opponents stills (roster → 2/3 remaining → snap-rest)
      // must refresh even when applyRouteIfNew skips goTo. Null clears so later stills
      // restore the live Full chip.
      if (parsed.fightQuotaScenario !== lastFightQuotaScenario.current) {
        lastFightQuotaScenario.current = parsed.fightQuotaScenario ?? null;
        setFightQuotaCaptureScenario(parsed.fightQuotaScenario ?? null);
      } else if (
        (parsed.route === 'Opponents' || parsed.route === 'ConfirmFight') &&
        parsed.fightQuotaScenario
      ) {
        setFightQuotaCaptureScenario(parsed.fightQuotaScenario);
      } else if (
        (parsed.route === 'Opponents' || parsed.route === 'ConfirmFight') &&
        parsed.fightQuotaScenario == null
      ) {
        lastFightQuotaScenario.current = null;
        setFightQuotaCaptureScenario(null);
      }
      if (parsed.paintId) setDemoPaintId(parsed.paintId);
      if (parsed.weaponId) setDemoWeaponId(parsed.weaponId);
      // Idempotent set — safer than toggle when prefs hydrate from disk.
      if (parsed.mute === true) setMuted(true);
      if (parsed.mute === false) setMuted(false);
      // D1 rewatch capture stills: force Fight View control set before route paint.
      if (parsed.fightViewMode) setFightViewMode(parsed.fightViewMode);
    };

    const applyRouteIfNew = (route: FirstRunRoute | null, fromFile: boolean) => {
      if (!route) return;
      if (lastAppliedRoute.current === route) {
        // P3: file named a route already applied (deep link / prior poll) — still
        // consume + delete so the poll does not run the full budget.
        // Same-route stills (Ranking offline → Ranking auth_expired) still refresh
        // sessionFailure via applyPaintWeaponMute above.
        if (fromFile && !fileConsumed.current) {
          fileConsumed.current = true;
          void consumeCaptureIntentFile();
        }
        return;
      }
      lastAppliedRoute.current = route;
      console.log(`BOTORE_CAPTURE_ROUTE:${route}`);
      goTo(route);
      consumeCaptureRoute();
      if (fromFile && !fileConsumed.current) {
        fileConsumed.current = true;
        void consumeCaptureIntentFile();
      }
    };

    const applyUrl = (url: string | null) => {
      if (!url) return;
      const parsed = parseDesignCaptureUrl(url);
      applyPaintWeaponMute(parsed);
      // Persist for ConfirmFight / C10 session-failure / capture consumers.
      // Always write sessionFailure (null clears sticky auth_expired).
      mergeIntent({
        route: parsed.route,
        paintId: parsed.paintId,
        weaponId: parsed.weaponId,
        mute: parsed.mute,
        battleId: null,
        rankingScenario: parsed.rankingScenario,
        failClosed: parsed.failClosed,
        poseCompare: parsed.poseCompare,
        sessionFailure: parsed.sessionFailure,
        fightViewMode: parsed.fightViewMode,
        customiseScenario: parsed.customiseScenario,
        resultScenario: parsed.resultScenario,
        homeScenario: parsed.homeScenario,
        fightQuotaScenario: parsed.fightQuotaScenario,
      });
      applyRouteIfNew(parsed.route, false);
    };

    const pending = peekCaptureIntent();
    applyPaintWeaponMute(pending);
    applyRouteIfNew(pending.route, false);

    let cancelled = false;
    void (async () => {
      // Poll briefly until the Documents intent file appears (iOS CI may rewrite
      // it after FirstRunShell mounts). Stop once the file has been consumed.
      for (let i = 0; i < 40 && !cancelled && !fileConsumed.current; i++) {
        const intent = await loadCaptureIntentFile();
        if (cancelled) return;
        applyPaintWeaponMute(intent);
        applyRouteIfNew(intent.route, true);
        if (fileConsumed.current) return;
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
    // muted intentionally omitted — read via mutedRef so mute toggles do not restart the poll.
  }, [
    goTo,
    setDemoPaintId,
    setDemoWeaponId,
    setRankingCaptureScenario,
    setSessionFailureCapture,
    setCustomiseCaptureScenario,
    setResultCaptureScenario,
    setHomeCaptureScenario,
    setFightQuotaCaptureScenario,
    setMuted,
  ]);
}
