/**
 * In-arena location tag (D10): `ARENA · REPAIR YARD`.
 * Small dark label under the HUD — not a pill, not tappable.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../garage-tag';
import { FIGHT_VIEW_ARENA_NAME, formatArenaLocationLabel } from './types';

export type ArenaLocationTagProps = {
  readonly arenaName?: string;
  /** Distance from the top of the arena (safe-area + HUD chrome). */
  readonly top: number;
  readonly testID?: string;
};

export function ArenaLocationTag({
  arenaName = FIGHT_VIEW_ARENA_NAME,
  top,
  testID = 'fight-view-arena-tag',
}: ArenaLocationTagProps): React.ReactElement {
  return (
    <View
      style={[styles.wrap, { top }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <View style={styles.pin} testID={`${testID}-pin`}>
        <View style={styles.pinHead} />
        <View style={styles.pinPoint} />
      </View>
      <Text style={styles.label} allowFontScaling numberOfLines={1}>
        {formatArenaLocationLabel(arenaName)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(36,33,29,0.82)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pin: {
    width: 8,
    height: 11,
    alignItems: 'center',
  },
  pinHead: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: garageTag.mustard,
    borderWidth: 1.5,
    borderColor: garageTag.cream,
  },
  pinPoint: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 4,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: garageTag.mustard,
  },
  label: {
    color: garageTag.cream,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
});
