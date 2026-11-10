import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  isDesignCaptureEnabled,
  isDesignCaptureFailClosedEnabled,
} from '../design-capture/captureEnv';
import {
  armDesignCaptureIntentListener,
  peekCaptureIntent,
} from '../design-capture/pendingCaptureIntent';
import { loadCaptureIntentFile } from '../design-capture/readCaptureIntentFile';
import { FightSessionProvider } from '../fight/FightSessionContext';
import { FirstRunShell } from '../first-run/FirstRunShell';
import { garageTag, InAppTitleSplash } from '../garage-tag';
import { isPlayableFailClosed, PlayableMisconfiguredScreen } from '../runtime';
import { readSupabasePublicConfig } from './auth/supabasePublicConfig';
import { AuthEntryScreen } from './screens/AuthEntryScreen';
import { LaunchTitleScreen } from './screens/LaunchTitleScreen';
import { SessionAuthErrorScreen } from './screens/SessionAuthErrorScreen';
import { GarageSessionProvider, useGarageSession } from './LoadoutSessionContext';

/** Minimum time the silhouette title stays visible after the bitmap loads. */
const TITLE_MIN_DISPLAY_MS = 900;

/**
 * Design-capture cold-start hold after hold-title is known.
 * Default 8s (local). CI live-fight bakes EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS
 * ≥60s so GHA SpringBoard compositing (~40s) cannot outlast native splash —
 * otherwise screenshots only ever see title (iOS ~77% graphite) or splash-only
 * (Android ~98%) strips.
 * Must stay shorter than {@link COLD_START_SPLASH_SAFETY_MS}.
 */
function readColdStartSplashHoldMs(
  raw: string | undefined = process.env.EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS,
): number {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1000) return Math.floor(n);
  return 8000;
}

export const COLD_START_NATIVE_SPLASH_MIN_MS = readColdStartSplashHoldMs();
/** Hold-title absolute escape — always longer than the min dwell. */
const COLD_START_SPLASH_SAFETY_MS = COLD_START_NATIVE_SPLASH_MIN_MS + 30_000;
/** Normal boot absolute cap so a stalled hydrate cannot pin the native splash. */
const NATIVE_SPLASH_SAFETY_MS = 4000;

// Hold the native launch screen until the in-app title image is ready (or safety fires).
void SplashScreen.preventAutoHideAsync().catch(() => {
  /* Expo Go / web may reject; ignore. */
});

function hideNativeSplash(): void {
  void SplashScreen.hideAsync().catch(() => {
    /* already hidden or unsupported */
  });
}

/**
 * F8 auth gate around shell-owned FirstRunShell.
 * F9 FightSession mounts inside the authenticated shell (Opponents / ConfirmFight).
 *
 * Normal cold start shows the C6 silhouette title (native splash releases on
 * image load, brief dwell, then AuthEntry). Design-capture cold-start holds
 * LaunchTitleScreen via coldStartHoldTitle so CI can assert splash→title.
 */
function GarageRootInner(): React.ReactElement {
  const {
    booting,
    session,
    coldStartHoldTitle,
    coldStartIntentReady,
    authKind,
    authBootError,
    retrySilentAuth,
  } = useGarageSession();
  const [titleImageReady, setTitleImageReady] = useState(false);
  const [titleDwellDone, setTitleDwellDone] = useState(false);
  const [holdSplashMinDone, setHoldSplashMinDone] = useState(!isDesignCaptureEnabled());
  const [retryBusy, setRetryBusy] = useState(false);
  const [captureFailClosed, setCaptureFailClosed] = useState(
    () => isDesignCaptureFailClosedEnabled() || peekCaptureIntent().failClosed === true,
  );
  const nativeHiddenRef = useRef(false);
  const coldStartHoldTitleRef = useRef(coldStartHoldTitle);
  const coldStartIntentReadyRef = useRef(coldStartIntentReady);
  coldStartHoldTitleRef.current = coldStartHoldTitle;
  coldStartIntentReadyRef.current = coldStartIntentReady;

  const misconfigured = useMemo(() => {
    // Design-capture evidence still / bake-time fail-closed override.
    if (captureFailClosed || isDesignCaptureFailClosedEnabled()) return true;
    if (authKind === 'unavailable') return true;
    return isPlayableFailClosed() && readSupabasePublicConfig() === null;
  }, [authKind, captureFailClosed]);

  // Arm deep-link capture before FirstRunShell exists so iOS getInitialURL is not missed.
  useEffect(() => {
    armDesignCaptureIntentListener();
    void loadCaptureIntentFile().then((intent) => {
      if (intent.failClosed === true) setCaptureFailClosed(true);
    });
  }, []);

  // C8 evidence: poll briefly for failClosed deep link / Documents intent.
  useEffect(() => {
    if (!isDesignCaptureEnabled() || captureFailClosed) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (peekCaptureIntent().failClosed === true) setCaptureFailClosed(true);
    };
    const id = setInterval(tick, 400);
    const stop = setTimeout(() => clearInterval(id), 16_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [captureFailClosed]);

  const releaseNativeSplash = useCallback(() => {
    if (nativeHiddenRef.current) return;
    nativeHiddenRef.current = true;
    hideNativeSplash();
  }, []);

  /**
   * Hide native splash only when it is safe for the current boot path:
   * - design-capture: wait until cold-start intent probe finished
   * - hold-title: also wait for min splash dwell + title bitmap (via caller)
   * - normal: release as soon as the boot title bitmap is ready
   */
  const maybeReleaseNativeSplash = useCallback(() => {
    if (!coldStartIntentReadyRef.current) return;
    if (coldStartHoldTitleRef.current) {
      // Hold path releases explicitly after min dwell + image ready.
      return;
    }
    releaseNativeSplash();
  }, [releaseNativeSplash]);

  const onTitleLoad = useCallback(() => {
    setTitleImageReady(true);
    maybeReleaseNativeSplash();
  }, [maybeReleaseNativeSplash]);

  const onTitleError = useCallback(() => {
    // Bitmap failed — drop native splash and skip the dwell so auth can proceed.
    setTitleImageReady(true);
    setTitleDwellDone(true);
    setHoldSplashMinDone(true);
    if (coldStartIntentReadyRef.current && !coldStartHoldTitleRef.current) {
      releaseNativeSplash();
    }
  }, [releaseNativeSplash]);

  // Design-capture hold-title: keep native splash for CI, then reveal silhouette.
  useEffect(() => {
    if (!coldStartHoldTitle || !coldStartIntentReady) return;
    const handle = setTimeout(() => {
      setHoldSplashMinDone(true);
    }, COLD_START_NATIVE_SPLASH_MIN_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [coldStartHoldTitle, coldStartIntentReady]);

  useEffect(() => {
    if (!coldStartHoldTitle) return;
    if (!holdSplashMinDone || !titleImageReady) return;
    releaseNativeSplash();
  }, [coldStartHoldTitle, holdSplashMinDone, titleImageReady, releaseNativeSplash]);

  // Short minimum display once the silhouette has loaded (covers cold start → AuthEntry).
  useEffect(() => {
    if (!titleImageReady || titleDwellDone) return;
    if (coldStartHoldTitle) return; // hold path stays on LaunchTitleScreen
    const handle = setTimeout(() => {
      setTitleDwellDone(true);
    }, TITLE_MIN_DISPLAY_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [titleImageReady, titleDwellDone, coldStartHoldTitle]);

  // Safety: never leave the native splash up forever — but do NOT defeat hold-title dwell.
  useEffect(() => {
    if (isDesignCaptureEnabled() && !coldStartIntentReady) {
      // Probe still running — keep splash; hold/normal safety arms after probe.
      return;
    }
    if (coldStartHoldTitle) {
      const handle = setTimeout(() => {
        setTitleImageReady(true);
        setHoldSplashMinDone(true);
        setTitleDwellDone(true);
        releaseNativeSplash();
      }, COLD_START_SPLASH_SAFETY_MS);
      return () => {
        clearTimeout(handle);
      };
    }
    const handle = setTimeout(() => {
      setTitleImageReady(true);
      setTitleDwellDone(true);
      setHoldSplashMinDone(true);
      releaseNativeSplash();
    }, NATIVE_SPLASH_SAFETY_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [coldStartHoldTitle, coldStartIntentReady, releaseNativeSplash]);

  // C7c design-capture cold-start: hold launch-title (skip silent auth).
  // Mount title under the native splash; release only after min dwell + onLoad.
  if (coldStartHoldTitle) {
    return (
      <LaunchTitleScreen
        onImageLoad={() => {
          setTitleImageReady(true);
        }}
        onImageError={() => {
          setTitleImageReady(true);
          // Still honor min dwell so CI can capture splash before title/error UI.
        }}
      />
    );
  }

  const showTitle = booting || !titleImageReady || !titleDwellDone || !coldStartIntentReady;

  if (showTitle) {
    return (
      <View style={styles.boot} testID="garage-booting">
        <InAppTitleSplash onImageLoad={onTitleLoad} onImageError={onTitleError} />
      </View>
    );
  }

  // C8: preview/production without Supabase public env — actionable blocked UI.
  if (misconfigured) {
    return (
      <SafeAreaProvider>
        <PlayableMisconfiguredScreen />
      </SafeAreaProvider>
    );
  }

  // C12: silent first-launch / restore failure → offline/session error (never AuthEntry / DEV).
  if (!session && authBootError) {
    return (
      <SafeAreaProvider>
        <SessionAuthErrorScreen
          title="Could not sign in"
          detail={authBootError.message}
          retryBusy={retryBusy}
          onRetry={() => {
            setRetryBusy(true);
            void retrySilentAuth().finally(() => setRetryBusy(false));
          }}
        />
      </SafeAreaProvider>
    );
  }


  if (!session) {
    return (
      <SafeAreaProvider>
        <AuthEntryScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <FightSessionProvider>
      <FirstRunShell />
    </FightSessionProvider>
  );
}

export function GarageRoot(): React.ReactElement {
  return (
    <GarageSessionProvider>
      <GarageRootInner />
    </GarageSessionProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: garageTag.graphite,
  },
});
