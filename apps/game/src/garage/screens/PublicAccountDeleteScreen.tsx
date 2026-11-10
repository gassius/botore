import React, { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
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
import {
  buildDeletionSupportMailto,
  readDeletionSupportEmail,
} from '../auth/deletionSupportContact';
import { readSupabasePublicConfig } from '../auth/supabasePublicConfig';

/**
 * R5 public web deletion page (`/account/delete`).
 * Primary: redeem a one-time code minted in-app.
 * Fallback (M3): support request for players who uninstalled without a code.
 */
export function PublicAccountDeleteScreen(): React.ReactElement {
  const [mode, setMode] = useState<'code' | 'support'>('code');
  const [code, setCode] = useState('');
  const [confirmTyped, setConfirmTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [platform, setPlatform] = useState('iOS Game Center');
  const [platformId, setPlatformId] = useState('');
  const [notes, setNotes] = useState('');

  const supportEmail = useMemo(() => readDeletionSupportEmail(), []);

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

  const onSupportRequest = useCallback(async () => {
    if (!supportEmail) {
      setError('Support contact is not configured for this deployment yet.');
      return;
    }
    if (!contactEmail.trim().includes('@') || platformId.trim().length < 4) {
      setError('Enter a contact email and your Game Center / Play Games player id.');
      return;
    }
    setBusy(true);
    setError(null);
    const mailto = buildDeletionSupportMailto({
      supportEmail,
      contactEmail,
      platform,
      platformId,
      notes,
    });
    try {
      await Linking.openURL(mailto);
      setSupportSent(true);
    } catch {
      setError('Could not open your email app. Copy the support address from the note below.');
    } finally {
      setBusy(false);
    }
  }, [contactEmail, notes, platform, platformId, supportEmail]);

  return (
    <ScreenChrome
      testID="slot-public-account-delete"
      footer={
        done || supportSent ? null : mode === 'code' ? (
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
              label="No code? Request deletion"
              onPress={() => {
                setMode('support');
                setError(null);
              }}
              disabled={busy}
              testID="public-delete-no-code"
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
        ) : (
          <>
            <PrimaryButton
              label={busy ? 'Opening mail…' : 'Email deletion request'}
              onPress={() => {
                void onSupportRequest();
              }}
              disabled={busy}
              testID="public-delete-support-send"
            />
            <SecondaryButton
              label="Back to code"
              onPress={() => {
                setMode('code');
                setError(null);
              }}
              disabled={busy}
              testID="public-delete-back-code"
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
          Your account is deleted and can no longer be accessed. Anonymized game records are kept
          for integrity. If you still have the app installed, sign out or reinstall to start fresh.
        </Text>
      ) : supportSent ? (
        <Text style={styles.body} allowFontScaling testID="public-delete-support-sent">
          Your mail app should have opened a deletion request. Ops will verify identity and run the
          admin soft-delete + Auth retire runbook.
        </Text>
      ) : mode === 'code' ? (
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
      ) : (
        <View style={styles.form} testID="public-delete-support-form">
          <Text style={styles.body} allowFontScaling>
            Uninstalled without a code? Send a deletion request with your platform player id so
            support can verify ownership and delete the account.
          </Text>
          {supportEmail ? (
            <Text style={styles.note} allowFontScaling>
              Requests go to {supportEmail}.
            </Text>
          ) : (
            <Text style={styles.note} allowFontScaling testID="public-delete-support-unset">
              Support email is not configured on this host yet
              (`EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL`). Use the ops runbook in
              docs/backend/account-deletion.md.
            </Text>
          )}
          <Text style={styles.label} allowFontScaling>
            Contact email
          </Text>
          <TextInput
            value={contactEmail}
            onChangeText={setContactEmail}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={garageTag.steel}
            style={styles.input}
            testID="public-delete-support-email"
          />
          <Text style={styles.label} allowFontScaling>
            Platform
          </Text>
          <TextInput
            value={platform}
            onChangeText={setPlatform}
            autoCorrect={false}
            editable={!busy}
            placeholder="iOS Game Center / Android Play Games"
            placeholderTextColor={garageTag.steel}
            style={styles.input}
            testID="public-delete-support-platform"
          />
          <Text style={styles.label} allowFontScaling>
            Platform player id
          </Text>
          <TextInput
            value={platformId}
            onChangeText={setPlatformId}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="Game Center teamPlayerID or Play Games player id"
            placeholderTextColor={garageTag.steel}
            style={styles.input}
            testID="public-delete-support-platform-id"
          />
          <Text style={styles.label} allowFontScaling>
            Notes (optional)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            autoCorrect={false}
            editable={!busy}
            placeholder="Anything that helps verify ownership"
            placeholderTextColor={garageTag.steel}
            style={styles.input}
            testID="public-delete-support-notes"
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
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: garageTag.steel,
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
