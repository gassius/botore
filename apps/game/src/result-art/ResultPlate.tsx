/**
 * A3 — VICTORY / DEFEAT / NEW RECORD Garage Tag plates for D2.
 * Images only; callers must keep an accessible text label (spec text).
 */

import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { resultPlateSource } from './resultPlateAssets';
import {
  NEW_RECORD_STAMP_ROTATION_DEG,
  RESULT_PLATE_SPECS,
  type ResultPlateKind,
} from './resultPlateSpec';

export type ResultPlateProps = {
  readonly kind: ResultPlateKind;
  /** Override width in pt; height scales from kit aspect. */
  readonly widthPt?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

export function ResultPlate({
  kind,
  widthPt,
  style,
  testID = `result-plate-${kind}`,
}: ResultPlateProps): React.ReactElement {
  const spec = RESULT_PLATE_SPECS[kind];
  const width = widthPt ?? spec.sizePt[0];
  const height = width * (spec.sizePt[1] / spec.sizePt[0]);
  const tilted = kind === 'new_record';

  return (
    <View
      style={[styles.wrap, tilted ? styles.stampTilt : null, style]}
      accessibilityRole="image"
      accessibilityLabel={spec.accessibilityLabel}
      testID={testID}
    >
      <Image
        source={resultPlateSource(kind)}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        testID={`${testID}-image`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampTilt: {
    transform: [{ rotate: `${NEW_RECORD_STAMP_ROTATION_DEG}deg` }],
  },
});
