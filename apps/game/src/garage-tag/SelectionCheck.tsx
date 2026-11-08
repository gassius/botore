import React from 'react';
import { Image, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { uiKitAssets } from './assets';

export type SelectionCheckProps = {
  selected: boolean;
  /** Explicit non-colour cue for a11y. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Selected-state check from ui-kit glyph — shape cue, never colour alone. */
export function SelectionCheck({
  selected,
  label = 'Selected',
  style,
  testID,
}: SelectionCheckProps): React.ReactElement | null {
  if (!selected) {
    return null;
  }

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityLabel={label}
      accessibilityRole="image"
      testID={testID}
    >
      <Image
        source={uiKitAssets.glyphCheckSelected}
        style={styles.glyph}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    width: 28,
    height: 28,
  },
});
