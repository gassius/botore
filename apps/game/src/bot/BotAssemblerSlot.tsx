import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KitArtPlaceholder } from '../garage-tag';

/**
 * Shared props shape from shared-ui-rig-contract (F7 owns exact module).
 * Shell consumers use this slot — do not fork a second renderer here.
 */
export type BotAssemblerSlotProps = {
  loadout: {
    paintId: string;
    weaponId: string;
    chassisId?: string;
  };
  facing?: 'left' | 'right';
  paintId?: string;
  weaponId?: string;
  motionPose?: string;
  reducedMotion?: boolean;
  placeholder?: boolean;
  style?: StyleProp<ViewStyle>;
  stagger?: 'near-low' | 'far-high' | 'none';
  label?: string;
  testID?: string;
};

/**
 * Mount point for F7 `BotAssembler`. Until that module lands, show a labelled
 * PLACEHOLDER — never invent production Workshop Frame robots in this ticket.
 */
export function BotAssemblerSlot(props: BotAssemblerSlotProps): React.ReactElement {
  const paint = props.paintId ?? props.loadout.paintId;
  const weapon = props.weaponId ?? props.loadout.weaponId;
  // F7 will export BotAssembler from src/bot/BotAssembler — import when present.
  // Soft optional require avoided (Metro); placeholder is the overnight contract.
  return (
    <KitArtPlaceholder
      label={props.label ?? 'Workshop Frame bot'}
      detail={`PLACEHOLDER · paint=${paint} · weapon=${weapon} · F7 BotAssembler`}
      stagger={props.stagger ?? 'none'}
      style={props.style}
      testID={props.testID ?? 'bot-assembler-slot'}
    />
  );
}
