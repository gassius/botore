import React from 'react';
import {
  Pressable,
  Image,
  StyleSheet,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { garageTag } from './tokens';

export type GlyphButtonProps = {
  source: ImageSourcePropType;
  accessibilityLabel: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Icon-only control: 24dp glyph inside ≥48dp press target. */
export function GlyphButton({
  source,
  accessibilityLabel,
  onPress,
  selected = false,
  disabled = false,
  style,
  testID,
}: GlyphButtonProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hit,
        selected ? styles.selected : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      <Image
        source={source}
        style={styles.glyph}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: garageTag.touchMin,
    height: garageTag.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
  },
  selected: {
    backgroundColor: garageTag.mustard,
  },
  pressed: {
    backgroundColor: garageTag.paper,
  },
  disabled: {
    opacity: 0.45,
  },
  glyph: {
    width: 24,
    height: 24,
  },
});
