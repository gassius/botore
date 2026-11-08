import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { garageTag } from './tokens';
import { SelectionCheck } from './SelectionCheck';

export type PaintSwatchProps = {
  id: string;
  label: string;
  /** Paint preview colour — not the sole selected-state cue. */
  color: string;
  selected: boolean;
  disabled?: boolean;
  unavailableLabel?: string;
  onPress: () => void;
  testID?: string;
};

export function PaintSwatch({
  id,
  label,
  color,
  selected,
  disabled = false,
  unavailableLabel,
  onPress,
  testID,
}: PaintSwatchProps): React.ReactElement {
  const a11y = [
    label,
    selected ? 'selected' : null,
    disabled ? (unavailableLabel ?? 'unavailable') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={a11y}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.wrap,
        selected ? styles.wrapSelected : null,
        disabled ? styles.wrapDisabled : null,
      ]}
      testID={testID ?? `paint-swatch-${id}`}
    >
      <View style={[styles.chip, { backgroundColor: color }]} />
      <Text style={styles.label} numberOfLines={1} allowFontScaling>
        {label}
      </Text>
      <SelectionCheck selected={selected} style={styles.check} />
      {disabled && unavailableLabel ? (
        <Text style={styles.unavailable} allowFontScaling>
          {unavailableLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 88,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
    padding: 10,
    gap: 6,
  },
  wrapSelected: {
    borderWidth: 4,
    borderColor: garageTag.mustard,
  },
  wrapDisabled: {
    opacity: 0.55,
  },
  chip: {
    height: 28,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: garageTag.graphite,
  },
  label: {
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  unavailable: {
    fontSize: 11,
    fontWeight: '700',
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
});
