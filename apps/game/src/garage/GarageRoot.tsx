import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
