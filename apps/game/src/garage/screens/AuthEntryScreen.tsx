import React, { useState } from 'react';
import { Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, View } from 'react-native';
import {
  BrandWordmark,
  PrimaryButton,
  ScreenChrome,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { useGarageSession } from '../LoadoutSessionContext';

/** Authenticated entry — Garage Tag chrome from shell exports. */
export function AuthEntryScreen(): React.ReactElement {
  const { authKind, signIn } = useGarageSession();
  const [email, setEmail] = useState('dev@botore.local');
  const [password, setPassword] = useState('dev-password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignIn = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenChrome
        testID="auth-entry"
        footer={
          <PrimaryButton
            label="Enter garage"
            onPress={() => {
              void onSignIn();
            }}
            disabled={busy || authKind === 'unavailable'}
            testID="auth-enter"
          />
        }
      >
        <BrandWordmark width={200} />
        <Text style={styles.subtitle} allowFontScaling>
          Sign in to open your stable.{' '}
          {authKind === 'dev'
            ? 'DEV auth scaffold.'
            : authKind === 'unavailable'
              ? 'Backend required.'
              : 'Supabase Auth.'}
        </Text>

        {authKind === 'unavailable' ? (
          <StatusErrorBanner
            title="Backend required"
            detail="EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set for this playable build. DEV auth is not used."
            testID="auth-misconfigured"
          />
        ) : null}

        {error ? (
          <StatusErrorBanner title="Sign-in failed" detail={error} testID="auth-sign-in-error" />
        ) : null}

        <Text style={styles.label} allowFontScaling>
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          accessibilityLabel="Email"
          style={styles.input}
          testID="auth-email"
        />

        <Text style={styles.label} allowFontScaling>
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          accessibilityLabel="Password"
          style={styles.input}
          testID="auth-password"
        />

        <View style={styles.spacer} />
        <Text style={styles.footnote} allowFontScaling>
          Public anon key only — no service-role credentials. RLS + save_bot_loadout remain
          authoritative.
        </Text>
      </ScreenChrome>
    </KeyboardAvoidingView>
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
    color: garageTag.graphite,
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '700',
    color: garageTag.graphite,
  },
  input: {
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.white,
    paddingHorizontal: 14,
    fontSize: 16,
    color: garageTag.graphite,
  },
  spacer: {
    height: 8,
  },
  footnote: {
    marginTop: 8,
    fontSize: 12,
    color: garageTag.steel,
  },
});
