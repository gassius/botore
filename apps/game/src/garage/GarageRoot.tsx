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
import { GarageSessionProvider, useGarageSession } from './LoadoutSessionContext';

/** Minimum time the silhouette title stays visible after the bitmap loads. */
const TITLE_MIN_DISPLAY_MS = 900;
/** Absolute cap so a stalled hydrate / missing bitmap cannot pin the native splash. */
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
  const { booting, session, coldStartHoldTitle, authKind } = useGarageSession();
  const [titleImageReady, setTitleImageReady] = useState(false);
  const [titleDwellDone, setTitleDwellDone] = useState(false);
  const [captureFailClosed, setCaptureFailClosed] = useState(
    () => isDesignCaptureFailClosedEnabled() || peekCaptureIntent().failClosed === true,
  );
  const nativeHiddenRef = useRef(false);
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

  const onTitleLoad = useCallback(() => {
    setTitleImageReady(true);
    releaseNativeSplash();
  }, [releaseNativeSplash]);

  const onTitleError = useCallback(() => {
    // Bitmap failed — drop native splash and skip the dwell so auth can proceed.
    setTitleImageReady(true);
    setTitleDwellDone(true);
    releaseNativeSplash();
  }, [releaseNativeSplash]);

  // Short minimum display once the silhouette has loaded (covers cold start → AuthEntry).
  useEffect(() => {
    if (!titleImageReady || titleDwellDone) return;
    const handle = setTimeout(() => {
      setTitleDwellDone(true);
    }, TITLE_MIN_DISPLAY_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [titleImageReady, titleDwellDone]);

  // Safety: never leave the native splash up if boot stalls or title never loads.
  useEffect(() => {
    const handle = setTimeout(() => {
      setTitleImageReady(true);
      setTitleDwellDone(true);
      releaseNativeSplash();
    }, NATIVE_SPLASH_SAFETY_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [releaseNativeSplash]);

  // C7c design-capture cold-start: hold launch-title (skip AuthEntry / auto sign-in).
  if (coldStartHoldTitle) {
    return <LaunchTitleScreen />;
  }

  const showTitle = booting || !titleImageReady || !titleDwellDone;

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
