import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BrandWordmark,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import {
  formatDeletionCode,
  mintDeletionCode,
  PUBLIC_ACCOUNT_DELETE_PATH,
} from '../auth/accountDeleteClient';
import { readSupabasePublicConfig } from '../auth/supabasePublicConfig';
import { useGarageSession } from '../LoadoutSessionContext';

export type DeleteAccountPhase = 'confirm' | 'code' | 'done';

/**
 * R5 in-app account deletion — confirmation + optional web deletion code.
 * Mounted from Stable until C9 Settings lands; then move under Settings.
 */
export function DeleteAccountScreen(props: {
  onCancel: () => void;
  onDeleted: () => void;
}): React.ReactElement {
  const { session, deleteAccount } = useGarageSession();
  const [phase, setPhase] = useState<DeleteAccountPhase>('confirm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webCode, setWebCode] = useState<string | null>(null);
  const [confirmTyped, setConfirmTyped] = useState('');

  const browserOrigin = (globalThis as { location?: { origin?: string } }).location?.origin;
  const webPathHint =
    Platform.OS === 'web' && typeof browserOrigin === 'string'
      ? `${browserOrigin}${PUBLIC_ACCOUNT_DELETE_PATH}`
      : `…${PUBLIC_ACCOUNT_DELETE_PATH}`;

  const onMintCode = useCallback(async () => {
    setError(null);
    const config = readSupabasePublicConfig();
    const token = session?.accessToken;
    if (!config || !token) {
      setError('Could not mint a web deletion code in this build.');
      return;
    }
    setBusy(true);
    const minted = await mintDeletionCode(config, token);
    setBusy(false);
    if (!minted.ok) {
      setError(minted.message);
      return;
    }
    setWebCode(formatDeletionCode(minted.deletionCode));
    setPhase('code');
  }, [session?.accessToken]);

  const onConfirmDelete = useCallback(async () => {
    if (confirmTyped.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPhase('done');
    props.onDeleted();
  }, [confirmTyped, deleteAccount, props]);

  return (
    <ScreenChrome
      testID="slot-delete-account"
      footer={
        phase === 'done' ? (
          <PrimaryButton label="Continue" onPress={props.onDeleted} testID="delete-account-done" />
        ) : (
          <>
            {phase === 'confirm' ? (
              <SecondaryButton
                label="Mint web deletion code"
                onPress={() => {
                  void onMintCode();
                }}
                disabled={busy}
                testID="delete-account-mint-code"
              />
            ) : null}
            <PrimaryButton
              label={busy ? 'Deleting…' : 'Delete my account'}
              onPress={() => {
                void onConfirmDelete();
              }}
              disabled={busy}
              testID="delete-account-confirm"
            />
            <SecondaryButton
              label="Cancel"
              onPress={props.onCancel}
              disabled={busy}
              testID="delete-account-cancel"
            />
          </>
        )
      }
    >
      <BrandWordmark width={160} />
      <ScreenHeader title="Delete account" />

      {error ? (
        <StatusErrorBanner title="Could not delete account" detail={error} testID="delete-error" />
      ) : null}

      {phase === 'done' ? (
        <Text style={styles.body} allowFontScaling testID="delete-account-success">
          Your account has been deleted. Progress and platform links for this account are gone.
        </Text>
      ) : (
        <>
          <Text style={styles.body} allowFontScaling>
            This permanently deletes your Botore account. Display names are anonymized, platform
            links are removed, and you will be signed out. Fight history for other players is kept
            as anonymous records.
          </Text>
          <Text style={styles.body} allowFontScaling>
            Type DELETE below to confirm.
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
            testID="delete-account-type-confirm"
          />
          {phase === 'code' && webCode ? (
            <View style={styles.codeBox} testID="delete-account-web-code">
              <Text style={styles.codeLabel} allowFontScaling>
                Web deletion code (one-time)
              </Text>
              <Text style={styles.codeValue} selectable allowFontScaling>
                {webCode}
              </Text>
              <Text style={styles.codeHint} allowFontScaling>
                Use this at {webPathHint} if you uninstall the app before deleting.
              </Text>
            </View>
          ) : (
            <Text style={styles.note} allowFontScaling>
              Optional: mint a web deletion code first for {webPathHint} (store / privacy URL).
            </Text>
          )}
        </>
      )}
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: garageTag.graphite,
    marginBottom: 10,
  },
  note: {
    marginTop: 8,
    fontSize: 12,
    color: garageTag.steel,
  },
  input: {
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
    paddingHorizontal: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: garageTag.graphite,
    marginBottom: 12,
  },
  codeBox: {
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
    padding: 12,
    gap: 6,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  codeValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
    color: garageTag.graphite,
  },
  codeHint: {
    fontSize: 12,
    color: garageTag.steel,
  },
});
