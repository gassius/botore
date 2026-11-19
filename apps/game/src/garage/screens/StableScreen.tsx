import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { useFirstRun } from '../../first-run/FirstRunContext';
import {
  BrandWordmark,
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
import { useGarageSession } from '../LoadoutSessionContext';
import { LudusBotCarousel, type LudusCarouselItem } from '../ludus/LudusBotCarousel';
import { STABLE_HOME_TITLE } from '../stableHomeCopy';
import { DeleteAccountScreen } from './DeleteAccountScreen';

/** D5 More sheet Sign out — mockup `#B23A2E`. */
const MORE_SIGN_OUT = '#B23A2E';

/**
 * Ludus home (route id remains Stable). D5:
 * BOTORE + — LUDUS — + YOUR BOTS · n / cap, snap bot carousel + Create slot,
 * Customise → Find opponent → Settings | More. Sign out only under More.
 */
export function StableScreen(props: {
  onCustomise: () => void;
  onFindOpponent?: () => void;
  onSettings?: () => void;
  onRanking?: () => void;
  onCreateBot?: () => void;
}): React.ReactElement {
  const {
    loadout,
    canProgress,
    signOut,
    retryHydration,
    ownedBots,
    botCap,
    selectActiveBot,
    refreshOwnedBots,
  } = useGarageSession();
  const { homeCaptureScenario, muted, musicEnabled, effectsEnabled } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const insets = useSafeAreaInsets();
  const forced = useForcedSessionFailure();
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => homeCaptureScenario === 'more');
  /** Derived from carousel focus via onSnap (incl. init) — not a second source of truth. */
  const [focusedKind, setFocusedKind] = useState<'bot' | 'create'>(() =>
    homeCaptureScenario === 'create-slot' ? 'create' : 'bot',
  );
  /** In-flight Ludus select — Find opponent awaits so combat-v1 sees active_character_id. */
  const selectPromiseRef = useRef<Promise<boolean> | null>(null);

  const ownedCount = ownedBots.length;
  const cap = botCap > 0 ? botCap : 3;
  const onCreateSlide = focusedKind === 'create';
  const actionsEnabled = canProgress && !onCreateSlide;
  // M2: hydrated loadout but empty owned list → list failure, not a lone Create slot.
  const ownedListFailed =
    ownedBots.length === 0 &&
    loadout.confirmedLoadout != null &&
    loadout.hydration !== 'unavailable';

  const captureInitialIndex = useMemo(() => {
    if (homeCaptureScenario === 'create-slot') {
      // Create is last when under cap; at cap there is no create slide.
      return ownedCount < cap ? ownedCount : Math.max(0, ownedCount - 1);
    }
    const activeIdx = ownedBots.findIndex((b) => b.isActive);
    return activeIdx >= 0 ? activeIdx : 0;
  }, [homeCaptureScenario, ownedBots, ownedCount, cap]);

  useEffect(() => {
    if (homeCaptureScenario === 'more') {
      setMoreOpen(true);
    } else if (homeCaptureScenario === 'create-slot') {
      setMoreOpen(false);
      setFocusedKind(ownedCount < cap ? 'create' : 'bot');
    } else if (homeCaptureScenario === 'bot') {
      setMoreOpen(false);
      setFocusedKind('bot');
    }
  }, [homeCaptureScenario, ownedCount, cap]);

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

  const handleSnap = useCallback(
    (_index: number, item: LudusCarouselItem) => {
      uiAudio.playCue('uiSnap');
      setFocusedKind(item.kind === 'create' ? 'create' : 'bot');
    },
    [uiAudio],
  );

  const handleSelectBot = useCallback(
    (characterId: string) => {
      // In-place select (E4 selectActiveBot no longer sets booting).
      const pending = selectActiveBot(characterId);
      selectPromiseRef.current = pending;
      void pending.finally(() => {
        if (selectPromiseRef.current === pending) {
          selectPromiseRef.current = null;
        }
      });
    },
    [selectActiveBot],
  );

  const handleFindOpponent = useCallback(() => {
    uiAudio.playCue('uiConfirm');
    const go = () => props.onFindOpponent?.();
    const pending = selectPromiseRef.current;
    if (pending) {
      void pending.then(go, go);
      return;
    }
    go();
  }, [props, uiAudio]);

  const handleCreateBot = useCallback(() => {
    if (ownedCount >= cap) {
      uiAudio.playCue('uiError');
      return;
    }
    uiAudio.playCue('uiCreate');
    props.onCreateBot?.();
  }, [cap, ownedCount, props, uiAudio]);

  const handleRetryOwnedList = useCallback(() => {
    uiAudio.playUiTap();
    void refreshOwnedBots();
  }, [refreshOwnedBots, uiAudio]);

  // Equip patches ownedBots + awaits refreshOwnedBots while Customise is up
  // (PRR M2) — no mount refresh (avoids racing select + double uiSnap).

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
    failureKind === 'offline' || loadout.hydration === 'unavailable' || ownedListFailed ? (
      <SecondaryButton
        label={
          failureKind === 'offline'
            ? sessionFailureCopy('offline').actionLabel
            : failureKind === 'auth_expired'
              ? sessionFailureCopy('auth_expired').actionLabel
              : ownedListFailed
                ? 'Retry bots'
                : 'Retry load'
        }
        onPress={() => {
          uiAudio.playUiTap();
          if (failureKind === 'auth_expired') {
            void signOut();
            return;
          }
          if (ownedListFailed) {
            handleRetryOwnedList();
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
        disabled={!actionsEnabled}
        onDisabledPress={() => uiAudio.playCue('uiError')}
        testID="stable-customise"
      />
      <PrimaryButton
        label="Find opponent"
        onPress={handleFindOpponent}
        disabled={!actionsEnabled || !props.onFindOpponent}
        onDisabledPress={() => uiAudio.playCue('uiError')}
        testID="stable-find-opponent"
      />
      {retryFooter}
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
        <View style={styles.body}>
          <BrandWordmark width={140} />
          <ScreenHeader title={STABLE_HOME_TITLE} />
          <Text style={styles.counter} allowFontScaling testID="ludus-bots-counter">
            Your bots · {ownedCount} / {cap}
          </Text>

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
          ) : ownedListFailed ? (
            <StatusErrorBanner
              title="Could not load your bots"
              detail="Your Ludus list failed to load. Retry, or open Customise after refresh."
              testID="stable-owned-list-error"
            />
          ) : (
            <View style={styles.carouselBlock}>
              <LudusBotCarousel
                bots={ownedBots}
                cap={cap}
                initialIndex={captureInitialIndex}
                onSelectBot={handleSelectBot}
                onCreateBot={handleCreateBot}
                onSnap={handleSnap}
              />
            </View>
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
  body: {
    flex: 1,
    gap: 8,
    minHeight: 0,
    alignItems: 'center',
  },
  /**
   * Art: ~16pt below the card to Customise, with page dots in that gap.
   * marginBottom is the clear space under the dots; carousel root gap is
   * the space between card and dots.
   */
  carouselBlock: {
    width: '100%',
    alignItems: 'center',
    flexShrink: 1,
    marginBottom: 16,
  },
  counter: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.steel,
    marginBottom: 4,
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
