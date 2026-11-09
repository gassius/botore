import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { armDesignCaptureIntentListener } from '../design-capture/pendingCaptureIntent';
import { loadCaptureIntentFile } from '../design-capture/readCaptureIntentFile';
import { FightSessionProvider } from '../fight/FightSessionContext';
import { FirstRunShell } from '../first-run/FirstRunShell';
import { garageTag } from '../garage-tag';
import { AuthEntryScreen } from './screens/AuthEntryScreen';
import { GarageSessionProvider, useGarageSession } from './LoadoutSessionContext';

/**
 * F8 auth gate around shell-owned FirstRunShell.
 * F9 FightSession mounts inside the authenticated shell (Opponents / ConfirmFight).
 */
function GarageRootInner(): React.ReactElement {
  const { booting, session } = useGarageSession();

  // Arm deep-link capture before FirstRunShell exists so iOS getInitialURL is not missed.
  useEffect(() => {
    armDesignCaptureIntentListener();
    void loadCaptureIntentFile();
  }, []);

  if (booting) {
    return (
      <View style={styles.boot} testID="garage-booting">
        <ActivityIndicator color={garageTag.cream} />
        <Text style={styles.bootText}>Opening garage…</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: garageTag.graphite,
  },
  bootText: {
    marginTop: 12,
    color: garageTag.cream,
  },
});
