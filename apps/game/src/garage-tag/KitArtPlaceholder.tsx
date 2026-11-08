import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { garageTag } from './tokens';

export type KitArtPlaceholderProps = {
  /** What Game Art / F7 will supply. */
  label: string;
  detail?: string;
  style?: StyleProp<ViewStyle>;
  /** Stagger hint for raised arena layout guides only. */
  stagger?: 'near-low' | 'far-high' | 'none';
  testID?: string;
};

/**
 * Explicit PLACEHOLDER for Workshop Frame / arena / FX kit art.
 * Does not invent production robots — F7 BotAssembler + Game Art own visuals.
 */
export function KitArtPlaceholder({
  label,
  detail = 'PLACEHOLDER — pending Game Art / F7',
  style,
  stagger = 'none',
  testID,
}: KitArtPlaceholderProps): React.ReactElement {
  return (
    <View
      style={[styles.box, stagger === 'far-high' ? styles.far : null, stagger === 'near-low' ? styles.near : null, style]}
      accessibilityLabel={`${label}. ${detail}`}
      testID={testID}
    >
      <Text style={styles.tag} allowFontScaling>
        PLACEHOLDER
      </Text>
      <Text style={styles.label} allowFontScaling>
        {label}
      </Text>
      <Text style={styles.detail} allowFontScaling>
        {detail}
      </Text>
      {stagger !== 'none' ? (
        <Text style={styles.stagger} allowFontScaling>
          {stagger === 'near-low' ? 'Near / lower (layout guide)' : 'Far / higher (layout guide)'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 180,
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 6,
  },
  near: {
    marginTop: 24,
  },
  far: {
    marginBottom: 24,
    transform: [{ scale: 0.92 }],
  },
  tag: {
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
    color: garageTag.mustard,
    textTransform: 'uppercase',
  },
  label: {
    fontWeight: '800',
    fontSize: 16,
    color: garageTag.graphite,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  detail: {
    fontSize: 13,
    color: garageTag.steel,
    textAlign: 'center',
    fontWeight: '600',
  },
  stagger: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: garageTag.graphite,
    textTransform: 'uppercase',
  },
});
