import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { playerFacingDisplayName } from '../identity/platformPlayerId';
import { garageTag } from './tokens';

export type NameplateProps = {
  name: string;
  /** Lanista / Botore name under the bot name. */
  subtitle?: string;
  /** Optional ownership / role cue (e.g. YOU) — not paint colour. */
  badge?: string;
  /** Player plate: Oxide `#E8771C` rim (D11 Confirm face-off). */
  oxideRim?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Riveted name-tag geometry with native text (never baked into PNG).
 * C16: never renders Game Center / Play Games / device-fallback platform ids.
 */
export function Nameplate({
  name,
  subtitle,
  badge,
  oxideRim = false,
  style,
  testID,
}: NameplateProps): React.ReactElement {
  const safeName = playerFacingDisplayName(name);
  const safeSubtitle =
    typeof subtitle === 'string' && subtitle.trim().length > 0
      ? playerFacingDisplayName(subtitle)
      : null;
  return (
    <View
      style={[styles.tag, oxideRim ? styles.oxideRim : null, style]}
      testID={testID}
    >
      <View style={[styles.rivet, styles.rivetL]} />
      <View style={[styles.rivet, styles.rivetR]} />
      {badge ? (
        <Text style={styles.badge} allowFontScaling>
          {badge}
        </Text>
      ) : null}
      <Text
        style={styles.name}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        allowFontScaling
      >
        {safeName}
      </Text>
      {safeSubtitle ? (
        <Text style={styles.subtitle} numberOfLines={1} allowFontScaling>
          {safeSubtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  oxideRim: {
    borderColor: garageTag.oxide,
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
  rivetL: { left: 8 },
  rivetR: { right: 8 },
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
    width: '100%',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: garageTag.steel,
    textAlign: 'center',
    width: '100%',
  },
});
