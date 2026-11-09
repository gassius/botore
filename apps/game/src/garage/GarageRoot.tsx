import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { armDesignCaptureIntentListener } from '../design-capture/pendingCaptureIntent';
import { loadCaptureIntentFile } from '../design-capture/readCaptureIntentFile';
import { FightSessionProvider } from '../fight/FightSessionContext';
import { FirstRunShell } from '../first-run/FirstRunShell';
import { garageTag, InAppTitleSplash } from '../garage-tag';
import { AuthEntryScreen } from './screens/AuthEntryScreen';
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
 * Cold start without a session still shows the silhouette title: native splash
 * releases on title image load, then the title dwells briefly before AuthEntry.
 */
function GarageRootInner(): React.ReactElement {
  const { booting, session } = useGarageSession();
  const [titleImageReady, setTitleImageReady] = useState(false);
  const [titleDwellDone, setTitleDwellDone] = useState(false);
  const nativeHiddenRef = useRef(false);

  // Arm deep-link capture before FirstRunShell exists so iOS getInitialURL is not missed.
  useEffect(() => {
    armDesignCaptureIntentListener();
    void loadCaptureIntentFile();
  }, []);

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

  const showTitle = booting || !titleImageReady || !titleDwellDone;

  if (showTitle) {
    return (
      <View style={styles.boot} testID="garage-booting">
        <InAppTitleSplash onImageLoad={onTitleLoad} onImageError={onTitleError} />
      </View>
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
