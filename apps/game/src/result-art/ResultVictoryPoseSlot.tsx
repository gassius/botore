/**
 * A3 victory pose slot — raised-weapon art is NOT approved yet.
 *
 * Reserves a clear mount point (slotId) for D2. Renders no victory pose art
 * and never falls back to heavy_windup / sample plates-as-pose stand-ins.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  VICTORY_POSE_SLOT_ID,
  resolveResultBotPose,
  type PendingVictoryPoseSlot,
} from './resultPoseSlot';

export type ResultVictoryPoseSlotProps = {
  /** Reserved display size so D2 layout can size the future pose. */
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  /** Optional children once raised-weapon art lands (still gated by slot status). */
  readonly children?: React.ReactNode;
};

export function ResultVictoryPoseSlot({
  size = 280,
  style,
  testID = 'result-victory-pose-slot',
  children,
}: ResultVictoryPoseSlotProps): React.ReactElement {
  const resolved = resolveResultBotPose('victory') as PendingVictoryPoseSlot;

  return (
    <View
      style={[styles.slot, { width: size, minHeight: size }, style]}
      accessibilityLabel="Victory pose slot pending raised weapon art"
      accessibilityHint={resolved.slotId}
      testID={testID}
      nativeID={resolved.slotId}
    >
      {/* Stable hook id for D2 / future raised-weapon art drop-in. */}
      <View testID={`${testID}-hook`} nativeID={VICTORY_POSE_SLOT_ID} style={styles.hook} />
      {children ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hook: {
    width: 0,
    height: 0,
  },
});
