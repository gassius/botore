import React, { useEffect } from 'react';
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
  /** Machine code from silent auth (for logs only). */
  readonly code?: string;
  /** Raw technical message (for logs only — never shown verbatim). */
  readonly detail: string;
  readonly onRetry: () => void;
  readonly retryBusy?: boolean;
};

const PLAYER_FACING_DETAIL = "We couldn't reach the game server.";

/**
 * Offline / session error UX when silent first-launch auth fails.
 * Never falls back to DEV AuthEntry or invented credentials.
 */
export function SessionAuthErrorScreen({
  title = "Can't connect right now",
  code,
  detail,
  onRetry,
  retryBusy = false,
}: SessionAuthErrorScreenProps): React.ReactElement {
  useEffect(() => {
    console.warn(`BOTORE_SESSION_AUTH_ERROR code=${code ?? 'unknown'} message=${detail}`);
  }, [code, detail]);

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
        <StatusErrorBanner
          title={title}
          detail={PLAYER_FACING_DETAIL}
          testID="session-auth-error-banner"
        />
        <Text style={styles.footnote} allowFontScaling>
          Check your connection and try again.
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
  footnote: {
    marginTop: 12,
    fontSize: 12,
    color: garageTag.steel,
    fontWeight: '600',
  },
});
