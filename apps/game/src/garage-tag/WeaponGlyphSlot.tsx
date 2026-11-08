import React from 'react';
import { Pressable, Image, Text, View, StyleSheet } from 'react-native';
import { garageTag } from './tokens';
import { weaponGlyphSource, type WeaponGlyphId } from './assets';
import { SelectionCheck } from './SelectionCheck';

export type WeaponGlyphSlotProps = {
  id: WeaponGlyphId;
  label: string;
  selected: boolean;
  disabled?: boolean;
  reason?: string;
  onPress: () => void;
  testID?: string;
};

/**
 * Weapon glyph slot — kit glyph at fixed aspect inside ≥48dp press target.
 * Does not substitute for Game Art weapon sprites.
 */
export function WeaponGlyphSlot({
  id,
  label,
  selected,
  disabled = false,
  reason,
  onPress,
  testID,
}: WeaponGlyphSlotProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={[label, selected ? 'selected' : null, disabled ? reason ?? 'unavailable' : null]
        .filter(Boolean)
        .join(', ')}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.slot,
        selected ? styles.slotSelected : null,
        disabled ? styles.slotDisabled : null,
      ]}
      testID={testID ?? `weapon-slot-${id}`}
    >
      <View style={styles.glyphWrap}>
        <Image
          source={weaponGlyphSource(id)}
          style={styles.glyph}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
      <Text style={styles.label} numberOfLines={1} allowFontScaling>
        {label}
      </Text>
      <SelectionCheck selected={selected} style={styles.check} />
      {disabled && reason ? (
        <Text style={styles.reason} numberOfLines={2} allowFontScaling>
          {reason}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    minHeight: garageTag.touchMin + 24,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 4,
  },
  slotSelected: {
    backgroundColor: garageTag.mustard,
  },
  slotDisabled: {
    opacity: 0.55,
  },
  glyphWrap: {
    width: garageTag.touchMin,
    height: garageTag.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    width: 24,
    height: 24,
  },
  label: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  check: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  reason: {
    fontSize: 10,
    fontWeight: '700',
    color: garageTag.steel,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
