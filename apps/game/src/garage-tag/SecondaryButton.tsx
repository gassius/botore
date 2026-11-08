import React from 'react';
import { Pressable, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { garageTag } from './tokens';

export type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Cream secondary action — visually subordinate. Native text. */
export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  style,
  testID,
}: SecondaryButtonProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      <Text
        style={[styles.label, disabled ? styles.labelDisabled : null]}
        numberOfLines={2}
        allowFontScaling
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: garageTag.touchMin,
    backgroundColor: garageTag.cream,
    borderColor: garageTag.graphite,
    borderWidth: garageTag.outline,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: garageTag.paper,
  },
  disabled: {
    backgroundColor: garageTag.paper,
  },
  label: {
    color: garageTag.graphite,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  labelDisabled: {
    color: garageTag.steel,
  },
});
