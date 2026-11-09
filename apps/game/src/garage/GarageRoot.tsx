import React, { useEffect } from 'react';
<<<<<<< HEAD
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { armDesignCaptureIntentListener } from '../design-capture/pendingCaptureIntent';
import { loadCaptureIntentFile } from '../design-capture/readCaptureIntentFile';
=======
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
>>>>>>> 9dbd134 (feat(game): launch-v001 splash, icon, and in-app title (C6))
import { FightSessionProvider } from '../fight/FightSessionContext';
import { FirstRunShell } from '../first-run/FirstRunShell';
import { garageTag, InAppTitleSplash } from '../garage-tag';
import { AuthEntryScreen } from './screens/AuthEntryScreen';
import { GarageSessionProvider, useGarageSession } from './LoadoutSessionContext';

// Keep the native launch screen up until the silhouette title has painted.
void SplashScreen.preventAutoHideAsync().catch(() => {
  /* Expo Go / web may reject; ignore. */
});

/**
 * F8 auth gate around shell-owned FirstRunShell.
 * F9 FightSession mounts inside the authenticated shell (Opponents / ConfirmFight).
 */
function GarageRootInner(): React.ReactElement {
  const { booting, session } = useGarageSession();

<<<<<<< HEAD
  // Arm deep-link capture before FirstRunShell exists so iOS getInitialURL is not missed.
  useEffect(() => {
    armDesignCaptureIntentListener();
    void loadCaptureIntentFile();
  }, []);
=======
  useEffect(() => {
    if (!booting) {
      void SplashScreen.hideAsync().catch(() => {
        /* already hidden or unsupported */
      });
    }
  }, [booting]);
>>>>>>> 9dbd134 (feat(game): launch-v001 splash, icon, and in-app title (C6))

  if (booting) {
    return (
      <View style={styles.boot} testID="garage-booting">
        <InAppTitleSplash />
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
