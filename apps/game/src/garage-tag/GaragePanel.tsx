import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { garageTag } from './tokens';

export type GaragePanelProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Decorative corner rivets (non-interactive). */
  rivets?: boolean;
  /**
   * When true, panel + content wrapper participate in a flex:1 height chain
   * so a child ScrollView gets a bounded viewport (ScreenChrome frame).
   * Leave false for content-sized panels so they do not stretch.
   */
  fill?: boolean;
  testID?: string;
};

function Rivet({ style }: { style: StyleProp<ViewStyle> }): React.ReactElement {
  return (
    <View
      style={[styles.rivet, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * Parametric Garage Tag panel (kit prefers native rebuild over PNG stretch).
 * 10dp cut-corner language approximated with border + rivet margins.
 */
export function GaragePanel({
  children,
  style,
  rivets = true,
  fill = false,
  testID,
}: GaragePanelProps): React.ReactElement {
  return (
    <View style={[styles.panel, fill ? styles.panelFill : null, style]} testID={testID}>
      {rivets ? (
        <>
          <Rivet style={styles.rivetTL} />
          <Rivet style={styles.rivetTR} />
          <Rivet style={styles.rivetBL} />
          <Rivet style={styles.rivetBR} />
        </>
      ) : null}
      <View style={[styles.inner, fill ? styles.innerFill : null]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: garageTag.cream,
    borderColor: garageTag.graphite,
    borderWidth: garageTag.outline,
    borderRadius: garageTag.cutCorner,
    overflow: 'hidden',
  },
  panelFill: {
    flex: 1,
    flexDirection: 'column',
  },
  inner: {
    padding: 16,
  },
  innerFill: {
    flex: 1,
    flexDirection: 'column',
  },
  rivet: {
    position: 'absolute',
    width: garageTag.rivetRadius * 2,
    height: garageTag.rivetRadius * 2,
    borderRadius: garageTag.rivetRadius,
    backgroundColor: garageTag.steel,
    borderWidth: 1,
    borderColor: garageTag.graphite,
    zIndex: 1,
  },
  rivetTL: { top: 8, left: 8 },
  rivetTR: { top: 8, right: 8 },
  rivetBL: { bottom: 8, left: 8 },
  rivetBR: { bottom: 8, right: 8 },
});
