import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag } from './tokens';
import { SelectionCheck } from './SelectionCheck';

export type SettingsToggleRowProps = {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  detail?: string;
  disabled?: boolean;
  testID?: string;
};

/**
 * Garage Tag settings switch — mustard fill + check when on; never colour alone.
 */
export function SettingsToggleRow({
  label,
  value,
  onValueChange,
  detail,
  disabled = false,
  testID,
}: SettingsToggleRowProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.row,
        value ? styles.rowOn : styles.rowOff,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
      testID={testID}
    >
      <View style={styles.textCol}>
        <Text style={styles.label} allowFontScaling>
          {label}
        </Text>
        {detail ? (
          <Text style={styles.detail} allowFontScaling>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.stateCol}>
        <Text style={styles.state} allowFontScaling>
          {value ? 'On' : 'Off'}
        </Text>
        <SelectionCheck
          selected={value}
          label={`${label} on`}
          {...(testID ? { testID: `${testID}-check` } : {})}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowOn: {
    backgroundColor: garageTag.mustard,
  },
  rowOff: {
    backgroundColor: garageTag.cream,
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.55,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  detail: {
    fontWeight: '600',
    fontSize: 12,
    color: garageTag.steel,
  },
  stateCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 72,
    justifyContent: 'flex-end',
  },
  state: {
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
});
