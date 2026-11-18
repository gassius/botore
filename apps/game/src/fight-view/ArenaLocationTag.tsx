/**
 * In-arena location tag (D10 mockup): mustard pin + `ARENA · REPAIR YARD`.
 * Small dark label under the HUD — not a pill, not tappable.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../garage-tag';
import {
  FIGHT_VIEW_ARENA_NAME,
  FIGHT_VIEW_ARENA_TAG_LEFT,
  formatArenaLocationLabel,
} from './types';

export type ArenaLocationTagProps = {
  readonly arenaName?: string;
  /** Distance from the top of the arena (safe-area + HUD chrome). */
  readonly top: number;
  /**
   * Left inset. First watch uses the D10 mockup edge; rewatch must clear the
   * Back chevron (`arenaLocationTagLeft(true)`).
   */
  readonly left?: number;
  readonly testID?: string;
};

export function ArenaLocationTag({
  arenaName = FIGHT_VIEW_ARENA_NAME,
  top,
  left = FIGHT_VIEW_ARENA_TAG_LEFT,
  testID = 'fight-view-arena-tag',
}: ArenaLocationTagProps): React.ReactElement {
  return (
    <View
      style={[styles.wrap, { top, left }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <View style={styles.pin} testID={`${testID}-pin`}>
        <View style={styles.pinBody}>
          <View style={styles.pinHole} />
        </View>
        <View style={styles.pinTip} />
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
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(36,33,29,0.78)',
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 4,
  },
  pin: {
    width: 11,
    height: 13,
    alignItems: 'center',
  },
  pinBody: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: garageTag.mustard,
    borderWidth: 1.2,
    borderColor: garageTag.graphite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHole: {
    width: 3.2,
    height: 3.2,
    borderRadius: 2,
    backgroundColor: garageTag.graphite,
  },
  pinTip: {
    width: 0,
    height: 0,
    marginTop: -1.5,
    borderLeftWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: garageTag.mustard,
  },
  label: {
    color: '#e8dac0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
});
