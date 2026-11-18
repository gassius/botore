import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  SelectionCheck,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { useFirstRun } from '../../first-run/FirstRunContext';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { canContinueToConfirm } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';
import { A6_OPPONENTS, resolveA6OpponentPanel } from '../opponents/a6OpponentPanelAssets';
import { FightsRemainingPanel } from '../quota/FightsRemainingPanel';

/** Opponents domain — D8 snapped list + Fights Remaining (E3). */
export function OpponentsScreen(props: {
  onBack: () => void;
  onContinue: () => void;
}): React.ReactElement {
  const { canProgress, loadout, signOut } = useGarageSession();
  const { muted, musicEnabled, effectsEnabled } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const forced = useForcedSessionFailure();
  const {
    list,
    selected,
    candidatesKind,
    pendingIntent,
    fightInFlight,
    refreshCandidates,
    selectOpponent,
  } = useFightSession();
  const [visibleRange, setVisibleRange] = useState({ start: 1, end: 3 });
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  const noAllowance =
    list.status === 'ready' && list.allowancesRemaining < 1
      ? true
      : list.status === 'error' && list.code === 'allowance_exhausted';

  const emptyCandidates = list.status === 'ready' && list.candidates.length === 0;
  const listFailure =
    list.status === 'error'
      ? classifySessionFailure({
          code: list.code,
          message: list.message,
        })
      : null;
  const failureKind =
    forced ?? (listFailure === 'offline' || listFailure === 'auth_expired' ? listFailure : null);
  const otherError =
    list.status === 'error' && failureKind === null && list.code !== 'allowance_exhausted';
  const showEmpty = emptyCandidates && !failureKind;

  const recoverable =
    !!selected && pendingIntent !== null && pendingIntent.opponentId === selected.characterId;

  const canContinue =
    canProgress &&
    canContinueToConfirm({
      selected,
      listReady: list.status === 'ready',
      emptyCandidates,
      allowancesRemaining: list.status === 'ready' ? list.allowancesRemaining : 0,
      pendingIntent,
    });

  const candidateCount = list.status === 'ready' ? list.candidates.length : 0;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / A6_OPPONENTS.snapInterval);
    const start = Math.max(1, index + 1);
    const end = Math.min(candidateCount, start + 2);
    setVisibleRange({ start, end: Math.max(start, end) });
  };

  return (
    <ScreenChrome
      testID="slot-opponents"
      footer={
        <>
          <PrimaryButton
            label={recoverable && noAllowance ? 'Recover fight' : 'Continue'}
            disabled={!canContinue || fightInFlight}
            onPress={() => {
              uiAudio.playCue('uiConfirm');
              props.onContinue();
            }}
            onDisabledPress={() => uiAudio.playCue('uiError')}
            testID="opponents-continue"
          />
          {list.status === 'error' || failureKind ? (
            <PrimaryButton
              label={failureKind ? sessionFailureCopy(failureKind).actionLabel : 'Retry'}
              onPress={() => {
                uiAudio.playUiTap();
                if (failureKind === 'auth_expired') {
                  void signOut();
                  return;
                }
                void refreshCandidates();
              }}
              testID="opponents-retry"
            />
          ) : null}
        </>
      }
    >
      <ScreenHeader
        title="Opponents"
        onBack={() => {
          uiAudio.playCue('uiBack');
          props.onBack();
        }}
      />

      {candidatesKind === 'unavailable' ? (
        <StatusErrorBanner
          title="Backend required"
          detail="EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. DEV opponent roster is not used on playable builds."
          testID="opponents-misconfigured"
        />
      ) : null}

      {!canProgress ? (
        <StatusErrorBanner
          title="Equipped loadout unavailable"
          detail={
            loadout.lastError ??
            'Hydrate a server-confirmed loadout in the garage before requesting a fight.'
          }
          testID="opponents-hydration-blocked"
        />
      ) : null}

      {list.status === 'loading' || list.status === 'idle' ? (
        <View style={styles.center} testID="opponents-loading">
          <ActivityIndicator color={garageTag.mustard} />
          <Text style={styles.meta}>Loading opponents…</Text>
        </View>
      ) : null}

      {list.status === 'ready' ? (
        <FightsRemainingPanel
          quota={list.quota}
          testID="opponents-fights-remaining"
          onRefillDue={() => {
            void refreshCandidates();
          }}
        />
      ) : null}

      {noAllowance && !recoverable ? (
        <StatusErrorBanner
          title="No fights remaining"
          detail="Come back when the refill clock hits zero. Quota is server-owned."
          testID="opponents-no-allowance"
        />
      ) : null}

      {noAllowance && recoverable ? (
        <StatusErrorBanner
          title="Recover previous fight"
          detail="A fight may already be committed for this opponent. Continue reuses the same idempotency key — it will not spend another slot."
          testID="opponents-recover-intent"
        />
      ) : null}

      {showEmpty ? (
        <StatusErrorBanner
          title="No opponents available"
          detail="No system opponents with a confirmed loadout are readable right now."
          testID="opponents-empty"
        />
      ) : null}

      {failureKind ? (
        <SessionFailureBanner
          kind={failureKind}
          {...(list.status === 'error' ? { detail: list.message } : {})}
          testID={`opponents-session-${failureKind}`}
        />
      ) : null}

      {otherError && list.status === 'error' ? (
        <StatusErrorBanner
          title="Could not load opponents"
          detail={list.message}
          testID="opponents-error"
        />
      ) : null}

      {list.status === 'ready' && list.candidates.length > 0 ? (
        <>
          {candidatesKind === 'dev' ? (
            <Text style={styles.devHint} allowFontScaling testID="opponents-dev-roster">
              DEV roster
            </Text>
          ) : null}
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            snapToInterval={A6_OPPONENTS.snapInterval}
            decelerationRate="fast"
            disableIntervalMomentum
            snapToAlignment="start"
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            testID="opponents-list"
          >
            {list.candidates.map((c) => {
              const isSelected = selected?.characterId === c.characterId;
              const name = playerFacingDisplayName(c.displayName);
              const botore =
                typeof c.botoreName === 'string' && c.botoreName.trim().length > 0
                  ? playerFacingDisplayName(c.botoreName)
                  : null;
              const hasRecord = typeof c.wins === 'number' && typeof c.losses === 'number';
              const panelArt = resolveA6OpponentPanel({
                displayName: c.displayName,
                paintId: c.loadout.paint,
                weaponId: c.loadout.weapon,
              });
              return (
                <Pressable
                  key={c.characterId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${name}${botore ? `, ${botore}` : ''}${
                    hasRecord ? `, ${c.wins} wins ${c.losses} losses` : ''
                  }${isSelected ? ', selected' : ''}`}
                  onPress={() => {
                    selectOpponent(c);
                  }}
                  style={[styles.card, isSelected ? styles.cardSelected : null]}
                  testID={`opponent-${c.characterId}`}
                >
                  <View style={styles.stage} testID={`opponent-preview-wrap-${c.characterId}`}>
                    {panelArt ? (
                      <Image
                        source={panelArt}
                        style={styles.panelArt}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                        testID={`opponent-a6-panel-${c.characterId}`}
                      />
                    ) : (
                      <BotAssemblerSlot
                        loadout={{
                          chassisId: c.loadout.chassis,
                          paintId: c.loadout.paint,
                          weaponId: c.loadout.weapon,
                        }}
                        facing="left"
                        paintId={c.loadout.paint}
                        weaponId={c.loadout.weapon}
                        size={A6_OPPONENTS.robotBody}
                        reducedMotion
                        motionPose="idle"
                        testID={`opponent-preview-${c.characterId}`}
                      />
                    )}
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.name} numberOfLines={2} allowFontScaling>
                      {name}
                    </Text>
                    {botore ? (
                      <Text style={styles.botore} numberOfLines={1} allowFontScaling>
                        {botore}
                      </Text>
                    ) : null}
                    {hasRecord ? (
                      <Text style={styles.record} allowFontScaling>
                        <Text style={styles.recordNum}>{c.wins}</Text>W –{' '}
                        <Text style={styles.recordNum}>{c.losses}</Text>L
                      </Text>
                    ) : null}
                  </View>
                  <SelectionCheck selected={isSelected} style={styles.check} />
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.hint} allowFontScaling testID="opponents-snap-hint">
            {visibleRange.start}–{visibleRange.end} of {candidateCount} · scroll snaps one card at a
            time
          </Text>
        </>
      ) : null}
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  center: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  meta: {
    fontWeight: '700',
    fontSize: 13,
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
  devHint: {
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.steel,
    marginBottom: 4,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: A6_OPPONENTS.snapInterval * 3 - A6_OPPONENTS.cardGap,
  },
  list: {
    gap: A6_OPPONENTS.cardGap,
    paddingBottom: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: A6_OPPONENTS.cardHeight,
    backgroundColor: garageTag.white,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  cardSelected: {
    backgroundColor: garageTag.mustard,
  },
  stage: {
    width: A6_OPPONENTS.stageWidth,
    height: A6_OPPONENTS.stageHeight,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderRightWidth: garageTag.outline,
    borderRightColor: garageTag.graphite,
    backgroundColor: '#e3cfa9',
    overflow: 'hidden',
  },
  panelArt: {
    width: A6_OPPONENTS.stageWidth,
    height: A6_OPPONENTS.stageHeight,
  },
  metaCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    paddingVertical: 16,
    paddingHorizontal: 14,
    paddingRight: 36,
    justifyContent: 'center',
  },
  name: {
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  botore: {
    fontWeight: '700',
    fontSize: 13,
    color: '#6b6356',
  },
  record: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 2,
    borderTopColor: 'rgba(48,45,39,0.3)',
    borderStyle: 'dashed',
    fontWeight: '700',
    fontSize: 14,
    color: garageTag.graphite,
  },
  recordNum: {
    fontWeight: '900',
    fontSize: 22,
  },
  check: {
    position: 'absolute',
    right: -6,
    top: -6,
  },
  hint: {
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8a8070',
    marginTop: 8,
  },
});
