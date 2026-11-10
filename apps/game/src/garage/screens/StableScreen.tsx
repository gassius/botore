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
  WeaponGlyphSlot,
  garageTag,
} from '../../garage-tag';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { paintUiAlias, weaponUiAlias } from '../loadout/proofCatalogue';
import { useGarageSession } from '../LoadoutSessionContext';
import { DeleteAccountScreen } from './DeleteAccountScreen';

/** Stable domain — mounts into shell Stable slot; does not own routes. */
export function StableScreen(props: {
  onCustomise: () => void;
  onFindOpponent?: () => void;
}): React.ReactElement {
  const { loadout, canProgress, signOut, retryHydration } = useGarageSession();
<<<<<<< HEAD
  const forced = useForcedSessionFailure();
=======
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
>>>>>>> e65dd54 (feat: R5 in-app and public web account deletion)
  const confirmed = loadout.confirmedLoadout;
  const weapon = confirmed ? weaponUiAlias(confirmed.weapon) : 'sword';
  const displayName = loadout.displayName ?? 'Pilot';

<<<<<<< HEAD
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
=======
  // Temporary R5 entry until C9 Settings merges — then move under Settings.
  if (showDeleteAccount) {
    return (
      <DeleteAccountScreen
        onCancel={() => setShowDeleteAccount(false)}
        onDeleted={() => setShowDeleteAccount(false)}
      />
    );
  }
>>>>>>> e65dd54 (feat: R5 in-app and public web account deletion)

  return (
    <ScreenChrome
      testID="slot-stable"
      footer={
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
          {failureKind === 'offline' || loadout.hydration === 'unavailable' ? (
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
          ) : null}
          <SecondaryButton
            label="Delete account"
            onPress={() => setShowDeleteAccount(true)}
            testID="stable-delete-account"
          />
          <SecondaryButton
            label="Sign out"
            onPress={() => {
              void signOut();
            }}
            testID="stable-sign-out"
          />
        </>
      }
    >
      <BrandWordmark width={180} />
      <ScreenHeader title="Stable" />
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
          EQUIPPED — last server-confirmed loadout
        </Text>
      )}

      {confirmed ? (
        <>
          {/* Single assembler mount: BotAssemblerSlot → F7 apps/game/src/assembler (kit v002). */}
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
            label="Equipped bot"
            testID="stable-bot"
          />
          <View style={styles.row}>
            <WeaponGlyphSlot
              id={weapon}
              label={weapon}
              selected
              onPress={() => undefined}
              testID="stable-weapon"
            />
            <View style={styles.paintChip}>
              <Text style={styles.paintLabel} allowFontScaling>
                Paint: {paintUiAlias(confirmed.paint)}
              </Text>
              <Text style={styles.paintMeta} allowFontScaling>
                {confirmed.paint}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.note} allowFontScaling testID="stable-no-confirmed">
          No confirmed equipment is shown until hydration succeeds.
        </Text>
      )}

      <Text style={styles.note} allowFontScaling>
        Domain F8 · chrome from shell garage-tag · assembler via BotAssemblerSlot (F7 kit v002)
      </Text>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  equipped: {
    alignSelf: 'center',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  paintChip: {
    flex: 1,
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 2,
  },
  paintLabel: {
    fontWeight: '800',
    textTransform: 'uppercase',
    color: garageTag.graphite,
    fontSize: 13,
  },
  paintMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: garageTag.steel,
  },
  note: {
    marginTop: 8,
    fontSize: 12,
    color: garageTag.steel,
  },
});
