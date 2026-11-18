import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { useFirstRun } from '../../first-run/FirstRunContext';
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

/** Compact Ludus hero until D5/E4/E6 carousel lands — full kit on 390×844. */
const STABLE_BOT_SIZE = 200;

/** D5 More sheet Sign out — mockup `#B23A2E`. */
const MORE_SIGN_OUT = '#B23A2E';

/**
 * Ludus home (route id remains Stable). D5 footer IA:
 * Customise → Find opponent → Settings | More (side by side, More last).
 * Create Bot is the carousel last slot (E4/D5) — not a footer button.
 * Sign out only under More (with Ranking when wired, Privacy, Delete).
 */
export function StableScreen(props: {
  onCustomise: () => void;
  onFindOpponent?: () => void;
  onSettings?: () => void;
  onRanking?: () => void;
}): React.ReactElement {
  const { loadout, canProgress, signOut, retryHydration } = useGarageSession();
  const { homeCaptureScenario, muted, musicEnabled, effectsEnabled } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const insets = useSafeAreaInsets();
  const forced = useForcedSessionFailure();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => homeCaptureScenario === 'more');
  const confirmed = loadout.confirmedLoadout;
  const displayName = playerFacingDisplayName(loadout.displayName);

  useEffect(() => {
    if (homeCaptureScenario === 'more') {
      setMoreOpen(true);
    }
  }, [homeCaptureScenario]);

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
          uiAudio.playUiTap();
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
      <SecondaryButton
        label="Customise"
        onPress={() => {
          uiAudio.playUiTap();
          props.onCustomise();
        }}
        disabled={!canProgress}
        onDisabledPress={() => uiAudio.playCue('uiError')}
        testID="stable-customise"
      />
      <PrimaryButton
        label="Find opponent"
        onPress={() => {
          uiAudio.playCue('uiConfirm');
          props.onFindOpponent?.();
        }}
        disabled={!canProgress || !props.onFindOpponent}
        onDisabledPress={() => uiAudio.playCue('uiError')}
        testID="stable-find-opponent"
      />
      {retryFooter}
      {/* E4/D5: Create Bot lives in the bot carousel last slot (cap-aware), not here. */}
      <View style={styles.row2}>
        {props.onSettings ? (
          <SecondaryButton
            label="Settings"
            onPress={() => {
              uiAudio.playUiTap();
              props.onSettings?.();
            }}
            style={styles.row2Btn}
            testID="stable-settings"
          />
        ) : null}
        <SecondaryButton
          label="More"
          onPress={() => {
            uiAudio.playCue('uiTab');
            setMoreOpen(true);
          }}
          style={styles.row2Btn}
          testID="stable-more"
        />
      </View>
    </View>
  );

  return (
    <View style={styles.root} testID="stable-root">
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

      <Modal
        visible={moreOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          uiAudio.playCue('uiBack');
          setMoreOpen(false);
        }}
      >
        <View style={styles.sheetRoot} testID="stable-more-sheet">
          <Pressable
            style={styles.sheetDim}
            onPress={() => {
              uiAudio.playCue('uiBack');
              setMoreOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss More"
            testID="stable-more-dismiss"
          />
          <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={styles.grab} />
            <Text style={styles.sheetTitle} allowFontScaling>
              More
            </Text>
            {props.onRanking ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ranking"
                onPress={() => {
                  uiAudio.playUiTap();
                  setMoreOpen(false);
                  props.onRanking?.();
                }}
                style={styles.sheetItem}
                testID="stable-more-ranking"
              >
                <Text style={styles.sheetItemLabel} allowFontScaling>
                  Ranking
                </Text>
                <Text style={styles.sheetChevron} allowFontScaling>
                  ›
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Privacy policy"
              onPress={() => {
                uiAudio.playUiTap();
                setMoreOpen(false);
                setShowPrivacy(true);
              }}
              style={styles.sheetItem}
              testID="stable-privacy-policy"
            >
              <Text style={styles.sheetItemLabel} allowFontScaling>
                Privacy policy
              </Text>
              <Text style={styles.sheetChevron} allowFontScaling>
                ›
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              onPress={() => {
                uiAudio.playUiTap();
                setMoreOpen(false);
                setShowDeleteAccount(true);
              }}
              style={styles.sheetItem}
              testID="stable-delete-account"
            >
              <Text style={styles.sheetItemLabel} allowFontScaling>
                Delete account
              </Text>
              <Text style={styles.sheetChevron} allowFontScaling>
                ›
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={() => {
                uiAudio.playUiTap();
                setMoreOpen(false);
                void signOut();
              }}
              style={[styles.sheetItem, styles.sheetItemLast]}
              testID="stable-sign-out"
            >
              <Text style={[styles.sheetItemLabel, styles.signOutLabel]} allowFontScaling>
                Sign out
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
    gap: 10,
  },
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  row2Btn: {
    flex: 1,
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
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,26,22,0.6)',
  },
  sheet: {
    backgroundColor: garageTag.cream,
    borderTopWidth: 4,
    borderTopColor: garageTag.graphite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grab: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: garageTag.paper,
    marginBottom: 12,
  },
  sheetTitle: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    marginBottom: 12,
  },
  sheetItem: {
    minHeight: 54,
    borderBottomWidth: 2,
    borderBottomColor: garageTag.paper,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetItemLast: {
    borderBottomWidth: 0,
  },
  sheetItemLabel: {
    flex: 1,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  sheetChevron: {
    fontWeight: '800',
    fontSize: 18,
    color: garageTag.steel,
  },
  signOutLabel: {
    color: MORE_SIGN_OUT,
  },
});
