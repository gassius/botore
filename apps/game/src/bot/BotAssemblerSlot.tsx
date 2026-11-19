import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View, StyleSheet } from 'react-native';
import {
  BotAssembler,
  isMotionPose,
  type AssemblerLoadoutInput,
  type BotFacing,
  type MotionPose,
} from '../assembler';
import type { KitPoseEntry } from '../assembler/workshopFrameTypes';
import type { FightTimelineSmear } from '../fight/a2FightTimeline';

/**
 * Shared mount for F7 `BotAssembler` (`apps/game/src/assembler`, kit-v003 pin).
 * Shell/F8/fight import this slot or the assembler barrel — never fork a
 * second renderer. Do not mix stale Workshop Frame kit-v001 coordinates/assets.
 */
export type BotAssemblerSlotProps = {
  loadout: {
    paintId: string;
    weaponId: string;
    chassisId?: string;
  } & Pick<AssemblerLoadoutInput, 'head' | 'body' | 'arms' | 'legs'>;
  facing?: BotFacing;
  paintId?: string;
  weaponId?: string;
  motionPose?: MotionPose | string;
  /** Optional baked clip pose (design-capture fightBeat / A2b stills). */
  poseOverride?: KitPoseEntry;
  /** Optional attack smear for clip-attack capture stills. */
  smearOverlay?: FightTimelineSmear;
  reducedMotion?: boolean;
  /** Prefer false/omit so kit-v003 renders; true = geometric PLACEHOLDER only. */
  placeholder?: boolean;
  /** Forwarded to BotAssembler — PROVISIONAL display width (dp). */
  size?: number;
  style?: StyleProp<ViewStyle>;
  stagger?: 'near-low' | 'far-high' | 'none';
  label?: string;
  testID?: string;
};

export function BotAssemblerSlot(props: BotAssemblerSlotProps): React.ReactElement {
  const paint = props.paintId ?? props.loadout.paintId;
  const weapon = props.weaponId ?? props.loadout.weaponId;
  const motionPose: MotionPose = isMotionPose(props.motionPose) ? props.motionPose : 'idle';

  return (
    <View style={[styles.wrap, props.style]} testID={props.testID ?? 'bot-assembler-slot'}>
      <BotAssembler
        loadout={{
          chassis: props.loadout.chassisId ?? 'chassis-basic',
          paint,
          weapon,
          head: props.loadout.head ?? null,
          body: props.loadout.body ?? null,
          arms: props.loadout.arms ?? null,
          legs: props.loadout.legs ?? null,
        }}
        facing={props.facing ?? 'right'}
        paintId={paint}
        weaponId={weapon}
        motionPose={motionPose}
        {...(props.poseOverride !== undefined ? { poseOverride: props.poseOverride } : {})}
        {...(props.smearOverlay !== undefined ? { smearOverlay: props.smearOverlay } : {})}
        {...(props.reducedMotion !== undefined ? { reducedMotion: props.reducedMotion } : {})}
        {...(props.size !== undefined ? { size: props.size } : {})}
        placeholder={props.placeholder === true}
        testID={props.testID ? `${props.testID}-assembler` : 'bot-assembler'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // Do not force width:100% — fight cards / dual Confirm mounts size from
    // BotAssembler `size`. Stretching to parent clipped kit-v003 under overflow.
    alignItems: 'center',
  },
});
