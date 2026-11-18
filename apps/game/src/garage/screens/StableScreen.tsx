import React, { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  BrandWordmark,
  Nameplate,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { PrivacyPolicyScreen } from '../../legal/PrivacyPolicyScreen';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { useGarageSession } from '../LoadoutSessionContext';
import { STABLE_HOME_TITLE } from '../stableHomeCopy';
import { DeleteAccountScreen } from './DeleteAccountScreen';

/** Compact Ludus hero — full kit visible on iPhone 16 (390×844) without scrolling. */
const STABLE_BOT_SIZE = 200;

/**
 * Ludus home (route id remains Stable). Main footer order (closed More):
 * Customise → Find opponent → [E4 Create Bot slot] → Settings → More (last).
 * Sign out lives only under More with Privacy + Delete account.
 * Full carousel / counter / side-by-side Settings+More layout is D5.
 */
export function StableScreen(props: {
  onCustomise: () => void;
  onFindOpponent?: () => void;
  onSettings?: () => void;
  /** E4 wires Create Bot here — reserved above Settings so IA stays stable. */
  onCreateBot?: () => void;
}): React.ReactElement {
  const { loadout, canProgress, signOut, retryHydration } = useGarageSession();
  const forced = useForcedSessionFailure();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const confirmed = loadout.confirmedLoadout;
  const displayName = playerFacingDisplayName(loadout.displayName);

  const hydrationKind =
    loadout.hydration === 'unavailable'
      ? classifySessionFailure({
          code: loadout.lastErrorCode,
          message: loadout.lastError,
        })
      : null;
  const failureKind =
    forced ??
    (hydrationKind === 'offline' || hydrationKind === 'auth_expired' ? hydrationKind : null);

  if (showDeleteAccount) {
    return (
      <DeleteAccountScreen
        onCancel={() => setShowDeleteAccount(false)}
        onDeleted={() => setShowDeleteAccount(false)}
      />
    );
  }
  if (showPrivacy) {
    return <PrivacyPolicyScreen onBack={() => setShowPrivacy(false)} />;
  }

  const retryFooter =
    failureKind === 'offline' || loadout.hydration === 'unavailable' ? (
      <SecondaryButton
        label={
          failureKind === 'offline'
            ? sessionFailureCopy('offline').actionLabel
            : failureKind === 'auth_expired'
              ? sessionFailureCopy('auth_expired').actionLabel
              : 'Retry load'
        }
        onPress={() => {
          if (failureKind === 'auth_expired') {
            void signOut();
            return;
          }
          void retryHydration();
        }}
        testID="stable-retry-hydration"
      />
    ) : null;

  const footer = (
    <View style={styles.footerCompact}>
      {moreOpen ? (
        <>
          <SecondaryButton
            label="Sign out"
            onPress={() => {
              void signOut();
            }}
            testID="stable-sign-out"
          />
          <SecondaryButton
            label="Privacy policy"
            onPress={() => setShowPrivacy(true)}
            testID="stable-privacy-policy"
          />
          <SecondaryButton
            label="Delete account"
            onPress={() => setShowDeleteAccount(true)}
            testID="stable-delete-account"
          />
          <SecondaryButton
            label="Back"
            onPress={() => setMoreOpen(false)}
            testID="stable-more-back"
          />
        </>
      ) : (
        <>
          <SecondaryButton
            label="Customise"
            onPress={props.onCustomise}
            disabled={!canProgress}
            testID="stable-customise"
          />
          <PrimaryButton
            label="Find opponent"
            onPress={props.onFindOpponent ?? (() => undefined)}
            disabled={!canProgress || !props.onFindOpponent}
            testID="stable-find-opponent"
          />
          {retryFooter}
          {/* E4 Create Bot — reserved slot above Settings; omit until E4 wires onCreateBot. */}
          {props.onCreateBot ? (
            <SecondaryButton
              label="Create Bot"
              onPress={props.onCreateBot}
              testID="stable-create-bot"
            />
          ) : null}
          {props.onSettings ? (
            <SecondaryButton label="Settings" onPress={props.onSettings} testID="stable-settings" />
          ) : null}
          <SecondaryButton label="More" onPress={() => setMoreOpen(true)} testID="stable-more" />
        </>
      )}
    </View>
  );

  return (
    <ScreenChrome testID="slot-stable" scroll={false} footer={footer}>
      <View style={styles.bodyCompact}>
        <BrandWordmark width={140} />
        <ScreenHeader title={STABLE_HOME_TITLE} />
        <Nameplate name={displayName} badge="You" testID="stable-nameplate" />

        {failureKind ? (
          <SessionFailureBanner
            kind={failureKind}
            {...(loadout.lastError ? { detail: loadout.lastError } : {})}
            testID={`stable-session-${failureKind}`}
          />
        ) : loadout.hydration === 'unavailable' ? (
          <StatusErrorBanner
            title="Equipped loadout unavailable"
            detail={
              loadout.lastError ??
              'Could not load the server-confirmed loadout. Save and fight stay blocked until this succeeds.'
            }
            testID="stable-hydration-error"
          />
        ) : (
          <Text style={styles.equipped} allowFontScaling>
            Equipped
          </Text>
        )}

        {confirmed ? (
          <View style={styles.hero}>
            <BotAssemblerSlot
              loadout={{
                chassisId: confirmed.chassis,
                paintId: confirmed.paint,
                weaponId: confirmed.weapon,
              }}
              facing="right"
              paintId={confirmed.paint}
              weaponId={confirmed.weapon}
              motionPose="idle"
              size={STABLE_BOT_SIZE}
              label="Equipped bot"
              testID="stable-bot"
            />
          </View>
        ) : (
          <Text style={styles.note} allowFontScaling testID="stable-no-confirmed">
            No confirmed equipment is shown until hydration succeeds.
          </Text>
        )}
      </View>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  bodyCompact: {
    flex: 1,
    gap: 8,
    minHeight: 0,
  },
  hero: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCompact: {
    gap: 6,
  },
  equipped: {
    alignSelf: 'center',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  note: {
    marginTop: 4,
    fontSize: 12,
    color: garageTag.steel,
  },
});
