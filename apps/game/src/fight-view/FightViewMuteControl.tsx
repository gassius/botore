/**
 * Single in-arena mute control — same persisted prefs as Settings (C9).
 * No separate Mute footer button on Fight View.
 */
import React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { garageTag, uiKitAssets } from '../garage-tag';

export type FightViewMuteControlProps = {
  readonly muted: boolean;
  readonly onToggle: () => void;
  readonly testID?: string;
};

export function FightViewMuteControl({
  muted,
  onToggle,
  testID = 'fight-view-mute',
}: FightViewMuteControlProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Unmute audio' : 'Mute audio'}
      accessibilityState={{ selected: muted }}
      onPress={onToggle}
      style={({ pressed }) => [styles.hit, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Image
        source={muted ? uiKitAssets.glyphMute : uiKitAssets.glyphSound}
        style={styles.glyph}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(244,228,200,0.92)',
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  pressed: {
    backgroundColor: garageTag.paper,
  },
  glyph: {
    width: 22,
    height: 22,
  },
});
