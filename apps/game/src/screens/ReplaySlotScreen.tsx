/**
 * Domain Replay mount — player only; Garage Tag chrome stays with the shell slot.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusErrorBanner, garageTag } from '../garage-tag';
import { CanonicalReplayPlayer } from '../replay/CanonicalReplayPlayer';
import { loadDevGoldenConfirmedResult } from '../replay/loadDevReplay';
import type { ConfirmedFightResult } from '../replay/confirmedResult';
import { isDevScaffoldAllowed } from '../runtime/devScaffoldPolicy';

export interface ReplaySlotScreenProps {
  /** Live F9 fight confirmation when available; otherwise labelled DEV golden when allowed. */
  readonly confirmed?: ConfirmedFightResult;
  readonly muted?: boolean;
  readonly reducedMotion?: boolean;
  readonly onReplayFinished?: () => void;
}

export const ReplaySlotScreen: React.FC<ReplaySlotScreenProps> = ({
  confirmed,
  muted = false,
  reducedMotion,
  onReplayFinished,
}) => {
  const [finished, setFinished] = useState(false);
  const result = useMemo(() => {
    if (confirmed) return confirmed;
    if (isDevScaffoldAllowed()) return loadDevGoldenConfirmedResult(0);
    return null;
  }, [confirmed]);

  if (!result) {
    return (
      <View style={styles.root} testID="replay-slot-screen-blocked">
        <StatusErrorBanner
          title="Server fight required"
          detail="No sealed combat-v1 replay is available. Playable builds do not load DEV golden fixtures."
          testID="replay-slot-misconfigured"
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="replay-slot-screen">
      <CanonicalReplayPlayer
        result={result}
        muted={muted}
        {...(reducedMotion !== undefined ? { reducedMotion } : {})}
        autoPlay
        onFinished={() => {
          setFinished(true);
          onReplayFinished?.();
        }}
      />
      {finished ? (
        <Text style={styles.done} testID="replay-slot-finished">
          Playback finished · same checksum on repeat
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: garageTag.graphite,
    minHeight: 0,
  },
  done: {
    textAlign: 'center',
    color: garageTag.steel,
    fontSize: 11,
    paddingBottom: 8,
    flexShrink: 0,
  },
});
