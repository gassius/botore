import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BrandWordmark,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { deleteAccountWithCode } from '../auth/accountDeleteClient';
import { readSupabasePublicConfig } from '../auth/supabasePublicConfig';

/**
 * R5 public web deletion page (`/account/delete`).
 * No session required — redeem a one-time code minted in-app.
 */
export function PublicAccountDeleteScreen(): React.ReactElement {
  const [code, setCode] = useState('');
  const [confirmTyped, setConfirmTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = useCallback(async () => {
    if (confirmTyped.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    const config = readSupabasePublicConfig();
    if (!config) {
      setError('Deletion service is not configured for this deployment.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await deleteAccountWithCode(config, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
  }, [code, confirmTyped]);

  return (
    <ScreenChrome
      testID="slot-public-account-delete"
      footer={
        done ? null : (
          <>
            <PrimaryButton
              label={busy ? 'Deleting…' : 'Delete account'}
              onPress={() => {
                void onSubmit();
              }}
              disabled={busy || code.trim().length < 16}
              testID="public-delete-confirm"
            />
            <SecondaryButton
              label="Clear"
              onPress={() => {
                setCode('');
                setConfirmTyped('');
                setError(null);
              }}
              disabled={busy}
              testID="public-delete-clear"
            />
          </>
        )
      }
    >
      <BrandWordmark width={160} />
      <ScreenHeader title="Delete Botore account" />

      {error ? (
        <StatusErrorBanner
          title="Could not delete account"
          detail={error}
          testID="public-delete-error"
        />
      ) : null}

      {done ? (
        <Text style={styles.body} allowFontScaling testID="public-delete-success">
          Your account deletion request completed. If you still have the app installed, sign out or
          reinstall to start fresh.
        </Text>
      ) : (
        <View style={styles.form}>
          <Text style={styles.body} allowFontScaling>
            Enter the one-time web deletion code from Botore (Stable → Delete account → Mint web
            deletion code), then type DELETE to confirm.
          </Text>
          <Text style={styles.label} allowFontScaling>
            Deletion code
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx-xxxx"
            placeholderTextColor={garageTag.steel}
            style={styles.input}
            testID="public-delete-code"
          />
          <Text style={styles.label} allowFontScaling>
            Type DELETE to confirm
          </Text>
          <TextInput
            value={confirmTyped}
            onChangeText={setConfirmTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            placeholder="DELETE"
            placeholderTextColor={garageTag.steel}
            style={styles.input}
            testID="public-delete-type-confirm"
          />
        </View>
      )}
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: garageTag.graphite,
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  input: {
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
    paddingHorizontal: 12,
    fontWeight: '700',
    color: garageTag.graphite,
    marginBottom: 8,
  },
});
