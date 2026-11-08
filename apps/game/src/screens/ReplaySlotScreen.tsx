/**
 * Shell Replay slot mount — domain player only; no Garage Tag chrome ownership.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CanonicalReplayPlayer } from '../replay/CanonicalReplayPlayer';
import { loadDevGoldenConfirmedResult } from '../replay/loadDevReplay';
import type { ConfirmedFightResult } from '../replay/confirmedResult';

export interface ReplaySlotScreenProps {
  /** Live F9 fight confirmation when available; otherwise DEV golden fixture. */
  readonly confirmed?: ConfirmedFightResult;
  readonly muted?: boolean;
  readonly onReplayFinished?: () => void;
}

export const ReplaySlotScreen: React.FC<ReplaySlotScreenProps> = ({
  confirmed,
  muted = false,
  onReplayFinished,
}) => {
  const [finished, setFinished] = useState(false);
  const result = useMemo(() => confirmed ?? loadDevGoldenConfirmedResult(0), [confirmed]);

  return (
    <View style={styles.root} testID="replay-slot-screen">
      <Text style={styles.slotHint}>Replay slot · F10</Text>
      <CanonicalReplayPlayer
        result={result}
        muted={muted}
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
    backgroundColor: '#1E2226',
  },
  slotHint: {
    paddingHorizontal: 12,
    paddingTop: 8,
    color: '#9AA3AB',
    fontSize: 11,
    fontWeight: '700',
  },
  done: {
    textAlign: 'center',
    color: '#9AA3AB',
    fontSize: 11,
    paddingBottom: 8,
  },
});
