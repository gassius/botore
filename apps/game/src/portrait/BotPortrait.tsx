/**
 * A5 — per-bot ranking portrait from the live Workshop Frame rig.
 *
 * Always renders BotAssembler with that bot's paint + weapon. Never samples
 * kit `portraits/*.png` sheets as the product portrait.
 *
 * D4 Ranking wires this into rows; this module does not own Ranking UI.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BotAssembler,
  isMotionPose,
  resolvePaintVisual,
  resolveWeaponKit,
  type AssemblerLoadoutInput,
  type BotFacing,
} from '../assembler';
import { PORTRAIT_DISPLAY_PT, PORTRAIT_POSE_PREFERRED, portraitCropLayout } from './portraitSpec';

export type BotPortraitProps = {
  /** Confirmed or roster loadout — paint + weapon required for distinct looks. */
  readonly loadout: AssemblerLoadoutInput;
  /** Optional paint override without mutating loadout. */
  readonly paintId?: string;
  /** Optional weapon override without mutating loadout. */
  readonly weaponId?: string;
  readonly facing?: BotFacing;
  /** Display edge length in pt (default 46). */
  readonly size?: number;
  readonly reducedMotion?: boolean;
  readonly testID?: string;
};

function resolvePortraitMotionPose(): 'portrait' | 'idle' {
  return isMotionPose(PORTRAIT_POSE_PREFERRED) ? 'portrait' : 'idle';
}

export function BotPortrait({
  loadout,
  paintId,
  weaponId,
  facing = 'right',
  size = PORTRAIT_DISPLAY_PT,
  reducedMotion = true,
  testID = 'bot-portrait',
}: BotPortraitProps): React.ReactElement {
  const paint = paintId ?? loadout.paint;
  const weapon = weaponId ?? loadout.weapon;
  const motionPose = resolvePortraitMotionPose();
  const layout = useMemo(() => portraitCropLayout(size), [size]);
  const paintLabel = resolvePaintVisual(paint).label;
  const weaponLabel = resolveWeaponKit(weapon).label;
  const accessibilityLabel = `Bot portrait, ${paintLabel} ${weaponLabel.toLowerCase()}`;

  return (
    <View
      style={[styles.frame, { width: layout.cropSize, height: layout.cropSize }]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View
        style={[
          styles.canvasShift,
          {
            width: layout.canvasSize,
            height: layout.canvasSize,
            transform: [{ translateX: layout.offsetX }, { translateY: layout.offsetY }],
          },
        ]}
        pointerEvents="none"
        testID={`${testID}-crop`}
      >
        <BotAssembler
          loadout={loadout}
          facing={facing}
          paintId={paint}
          weaponId={weapon}
          motionPose={motionPose}
          reducedMotion={reducedMotion}
          placeholder={false}
          size={layout.canvasSize}
          testID={`${testID}-assembler`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 4,
  },
  canvasShift: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
