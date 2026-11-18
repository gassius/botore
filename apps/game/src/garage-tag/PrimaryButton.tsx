import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { garageTag } from './tokens';

export type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /**
   * When set, a visually disabled control still receives presses and calls this
   * (E8: soft `uiError` on blocked actions). Busy always swallows presses.
   */
  onDisabledPress?: () => void;
  /** In-button spinner (EQUIP saving). */
  busy?: boolean;
  /** Oxide unsaved-change dot (D3 EQUIP). */
  showUnsavedDot?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Mustard primary action — one per screen by convention. Native text, not baked. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  onDisabledPress,
  busy = false,
  showUnsavedDot = false,
  style,
  testID,
}: PrimaryButtonProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={busy || (disabled && !onDisabledPress)}
      onPress={() => {
        if (busy) return;
        if (disabled) {
          onDisabledPress?.();
          return;
        }
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        pressed && !disabled && !busy ? styles.pressed : null,
        disabled && !busy ? styles.disabled : null,
        style,
      ]}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator
          color={garageTag.graphite}
          testID={testID ? `${testID}-spinner` : undefined}
        />
      ) : (
        <Text
          style={[styles.label, disabled ? styles.labelDisabled : null]}
          numberOfLines={2}
          allowFontScaling
        >
          {label}
        </Text>
      )}
      {showUnsavedDot && !busy ? (
        <View
          style={styles.unsavedDot}
          accessibilityLabel="Unsaved changes"
          testID={testID ? `${testID}-unsaved-dot` : 'primary-unsaved-dot'}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: garageTag.touchMin,
    backgroundColor: garageTag.mustard,
    borderColor: garageTag.graphite,
    borderWidth: garageTag.outline,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  pressed: {
    backgroundColor: garageTag.mustardPressed,
  },
  disabled: {
    backgroundColor: garageTag.paper,
  },
  label: {
    color: garageTag.graphite,
    fontWeight: '800',
    fontSize: garageTag.bodySp,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  labelDisabled: {
    color: garageTag.steel,
  },
  unsavedDot: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: garageTag.oxide,
    borderWidth: 3,
    borderColor: garageTag.graphite,
  },
});
