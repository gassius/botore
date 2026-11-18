/**
 * A3 approved kneeling defeat — player's modular bot via BotAssembler.
 * D2 mounts this on the result overlay; not a full Fight Result screen.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BotAssembler, type AssemblerLoadoutInput, type BotFacing } from '../assembler';
import { resolveResultBotPose } from './resultPoseSlot';

export type ResultDefeatPoseProps = {
  readonly loadout: AssemblerLoadoutInput;
  readonly paintId?: string;
  readonly weaponId?: string;
  readonly facing?: BotFacing;
  readonly size?: number;
  readonly reducedMotion?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

export function ResultDefeatPose({
  loadout,
  paintId,
  weaponId,
  facing = 'right',
  size = 280,
  reducedMotion = false,
  style,
  testID = 'result-defeat-pose',
}: ResultDefeatPoseProps): React.ReactElement {
  const resolved = resolveResultBotPose('defeat');
  if (resolved.motionPose !== 'defeat') {
    throw new Error('result defeat pose must resolve to approved MotionPose defeat');
  }
  const paint = paintId ?? loadout.paint;
  const weapon = weaponId ?? loadout.weapon;

  return (
    <View style={[styles.wrap, style]} testID={testID} accessibilityLabel="defeat pose">
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

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
});
