/**
 * Domain FightResult mount — Garage Tag panels only; no duplicate charcoal shell.
 * Prefer first-run `FightResultSlot` for the integrated shell route.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PrimaryButton, SecondaryButton, StatusErrorBanner, garageTag } from '../garage-tag';
import type { ConfirmedFightResult } from '../replay/confirmedResult';
import { FightResultContent } from '../replay/FightResultContent';
import { loadDevGoldenConfirmedResult } from '../replay/loadDevReplay';
import { isDevScaffoldAllowed } from '../runtime/devScaffoldPolicy';

export interface FightResultSlotScreenProps {
  readonly confirmed?: ConfirmedFightResult;
  readonly onWatchReplay?: () => void;
  readonly onDone?: () => void;
}

export const FightResultSlotScreen: React.FC<FightResultSlotScreenProps> = ({
  confirmed,
  onWatchReplay,
  onDone,
}) => {
  const result = useMemo(() => {
    if (confirmed) return confirmed;
    if (isDevScaffoldAllowed()) return loadDevGoldenConfirmedResult(0);
    return null;
  }, [confirmed]);

  if (!result) {
    return (
      <View style={styles.root} testID="fight-result-slot-screen-blocked">
        <StatusErrorBanner
          title="Backend result required"
          detail="XP and allowances come from server-confirmed combat-v1 only. Playable builds do not invent sample progression."
          testID="fight-result-slot-misconfigured"
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="fight-result-slot-screen">
      <FightResultContent confirmed={result} testID="fight-result" />
      <View style={styles.actions}>
        <PrimaryButton
          label="Watch replay"
          onPress={() => onWatchReplay?.()}
          testID="fight-result-watch-replay"
        />
        <SecondaryButton label="Done" onPress={() => onDone?.()} testID="fight-result-done" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: garageTag.cream,
    padding: 16,
    gap: 12,
  },
  actions: {
    gap: 8,
    marginTop: 8,
  },
});
