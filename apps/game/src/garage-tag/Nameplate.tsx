import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { playerFacingDisplayName } from '../identity/platformPlayerId';
import { garageTag } from './tokens';

export type NameplateProps = {
  name: string;
  /** Optional ownership / role cue (e.g. YOU) — not paint colour. */
  badge?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Riveted name-tag geometry with native text (never baked into PNG).
 * C16: never renders Game Center / Play Games / device-fallback platform ids.
 */
export function Nameplate({ name, badge, style, testID }: NameplateProps): React.ReactElement {
  const safeName = playerFacingDisplayName(name);
  return (
    <View style={[styles.tag, style]} testID={testID}>
      <View style={[styles.rivet, styles.rivetL]} />
      <View style={[styles.rivet, styles.rivetR]} />
      {badge ? (
        <Text style={styles.badge} allowFontScaling>
          {badge}
        </Text>
      ) : null}
      <Text style={styles.name} numberOfLines={2} allowFontScaling>
        {safeName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    minHeight: 48,
    paddingHorizontal: 28,
    paddingVertical: 8,
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  rivet: {
    position: 'absolute',
    width: garageTag.rivetRadius * 2,
    height: garageTag.rivetRadius * 2,
    borderRadius: garageTag.rivetRadius,
    backgroundColor: garageTag.steel,
    borderWidth: 1,
    borderColor: garageTag.graphite,
    top: '50%',
    marginTop: -garageTag.rivetRadius,
  },
  rivetL: { left: 10 },
  rivetR: { right: 10 },
  badge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    textAlign: 'center',
  },
});
