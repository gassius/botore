import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandWordmark, ScreenChrome, StatusErrorBanner, garageTag } from '../garage-tag';
import { PLAYABLE_MISCONFIGURED_DETAIL, PLAYABLE_MISCONFIGURED_TITLE } from './devScaffoldPolicy';

/**
 * Actionable blocked UI when a non-DEV playable build lacks Supabase public env
 * (or is forced fail-closed for design-capture evidence).
 */
export function PlayableMisconfiguredScreen(): React.ReactElement {
  return (
    <View style={styles.root} testID="playable-misconfigured">
      <ScreenChrome testID="playable-misconfigured-chrome">
        <BrandWordmark width={200} />
        <Text style={styles.subtitle} allowFontScaling>
          Playable build blocked
        </Text>
        <StatusErrorBanner
          title={PLAYABLE_MISCONFIGURED_TITLE}
          detail={PLAYABLE_MISCONFIGURED_DETAIL}
          testID="playable-misconfigured-banner"
        />
        <Text style={styles.footnote} allowFontScaling>
          Set the Expo public Supabase URL and anon key for this profile, then rebuild. Preview and
          production never fall back to DEV golden fights or sample XP.
        </Text>
      </ScreenChrome>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: garageTag.graphite,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 15,
    fontWeight: '700',
    color: garageTag.graphite,
  },
  footnote: {
    marginTop: 12,
    fontSize: 12,
    color: garageTag.steel,
    fontWeight: '600',
  },
});
