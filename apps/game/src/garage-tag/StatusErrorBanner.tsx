import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { garageTag } from './tokens';

export type StatusErrorBannerProps = {
  title: string;
  detail?: string;
  testID?: string;
};

/** Actionable error chrome — native text; last confirmed loadout stays domain-owned. */
export function StatusErrorBanner({
  title,
  detail,
  testID,
}: StatusErrorBannerProps): React.ReactElement {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View style={styles.stripe} />
      <View style={styles.copy}>
        <Text style={styles.title} allowFontScaling>
          {title}
        </Text>
        {detail ? (
          <Text style={styles.detail} allowFontScaling>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: garageTag.cream,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    overflow: 'hidden',
    minHeight: 56,
  },
  stripe: {
    width: 6,
    backgroundColor: garageTag.error,
  },
  copy: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  title: {
    fontWeight: '800',
    fontSize: 15,
    color: garageTag.graphite,
  },
  detail: {
    fontSize: 13,
    color: garageTag.steel,
    fontWeight: '600',
  },
});
