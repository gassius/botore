import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { garageTag } from './tokens';
import { GaragePanel } from './GaragePanel';

export type ScreenChromeProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Safe-area aware Garage Tag screen frame. Never hard-codes specimen insets. */
export function ScreenChrome({
  children,
  footer,
  scroll = true,
  style,
  testID,
}: ScreenChromeProps): React.ReactElement {
  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.body}>{children}</View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, style]}
      edges={['top', 'left', 'right', 'bottom']}
      testID={testID}
    >
      <GaragePanel style={styles.frame} rivets>
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </GaragePanel>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: garageTag.graphite,
    padding: 10,
  },
  frame: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  body: {
    flex: 1,
    gap: 16,
  },
  footer: {
    gap: 10,
    paddingTop: 12,
  },
});
