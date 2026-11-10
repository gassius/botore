import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BrandWordmark,
  PrimaryButton,
  ScreenChrome,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';

export type SessionAuthErrorScreenProps = {
  readonly title?: string;
  readonly detail: string;
  readonly onRetry: () => void;
  readonly retryBusy?: boolean;
};

/**
 * Offline / session error UX when silent anonymous auth fails.
 * Never falls back to DEV AuthEntry or invented credentials.
 */
export function SessionAuthErrorScreen({
  title = 'Session unavailable',
  detail,
  onRetry,
  retryBusy = false,
}: SessionAuthErrorScreenProps): React.ReactElement {
  return (
    <View style={styles.root} testID="session-auth-error">
      <ScreenChrome
        testID="session-auth-error-chrome"
        footer={
          <PrimaryButton
            label={retryBusy ? 'Retrying…' : 'Try again'}
            onPress={onRetry}
            disabled={retryBusy}
            testID="session-auth-retry"
          />
        }
      >
        <BrandWordmark width={200} />
        <Text style={styles.subtitle} allowFontScaling>
          Could not open a play session
        </Text>
        <StatusErrorBanner title={title} detail={detail} testID="session-auth-error-banner" />
        <Text style={styles.footnote} allowFontScaling>
          Check your connection and try again. Playable builds never fall back to a local DEV
          account.
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
