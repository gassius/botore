/**
 * A3 approved overhead victory — player's modular bot via BotAssembler.
 * Keeps the historical Slot name + VICTORY_POSE_SLOT_ID hook for D2 wiring.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BotAssembler, type AssemblerLoadoutInput, type BotFacing } from '../assembler';
import { VICTORY_POSE_SLOT_ID, resolveResultBotPose } from './resultPoseSlot';

export type ResultVictoryPoseSlotProps = {
  readonly loadout: AssemblerLoadoutInput;
  readonly paintId?: string;
  readonly weaponId?: string;
  readonly facing?: BotFacing;
  /** Display width in pt over the 640 rig (victory may overflow above). */
  readonly size?: number;
  readonly reducedMotion?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

export function ResultVictoryPoseSlot({
  loadout,
  paintId,
  weaponId,
  facing = 'right',
  size = 280,
  reducedMotion = false,
  style,
  testID = 'result-victory-pose-slot',
}: ResultVictoryPoseSlotProps): React.ReactElement {
  const resolved = resolveResultBotPose('victory');
  if (resolved.motionPose !== 'victory') {
    throw new Error('result victory pose must resolve to approved MotionPose victory');
  }
  const paint = paintId ?? loadout.paint;
  const weapon = weaponId ?? loadout.weapon;

  // Kit stage margin above the 640 frame (160 px) — pad so overhead victory
  // is not clipped by parents that overflow:hidden.
  const stagePadTop = (160 / 640) * size;

  return (
    <View
      style={[styles.wrap, { paddingTop: stagePadTop }, style]}
      accessibilityLabel="victory pose"
      testID={testID}
      nativeID={resolved.slotId ?? VICTORY_POSE_SLOT_ID}
    >
      <BotAssembler
        loadout={loadout}
        facing={facing}
        paintId={paint}
        weaponId={weapon}
        motionPose={resolved.motionPose}
        reducedMotion={reducedMotion}
        placeholder={false}
        size={size}
        testID={`${testID}-assembler`}
      />
    </View>
  );
}

/** Alias for D2 consumers that prefer a non-Slot name. */
export const ResultVictoryPose = ResultVictoryPoseSlot;
export type ResultVictoryPoseProps = ResultVictoryPoseSlotProps;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    overflow: 'visible',
  },
});
