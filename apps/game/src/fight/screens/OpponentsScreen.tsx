import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  OPPONENTS_LIST,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  SelectionCheck,
  SnapVerticalList,
  StatusErrorBanner,
  garageTag,
} from '../../garage-tag';
import { a6OpponentPanelForCandidate } from '../../garage-tag/a6Tiles';
import { useFirstRun } from '../../first-run/FirstRunContext';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { canContinueToConfirm } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';
import type { OpponentCandidate } from '../candidates/types';
import { FightsRemainingPanel } from '../quota/FightsRemainingPanel';

/** Opponents domain — E6 SnapVerticalList + E3 Fights Remaining + E8 UI cues. */
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
  const [snapIndex, setSnapIndex] = useState(0);

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
  // Never present a network/auth failure as an empty "no opponents" board.
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

  const candidates = list.status === 'ready' ? list.candidates : [];
  const visibleCount = OPPONENTS_LIST.visibleCount;
  const rangeStart = candidates.length === 0 ? 0 : snapIndex + 1;
  const rangeEnd = Math.min(snapIndex + visibleCount, candidates.length);

  return (
    <ScreenChrome
      testID="slot-opponents"
      scroll={false}
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
      <View style={styles.body}>
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

        {list.status === 'ready' && candidates.length > 0 ? (
          <>
            {candidatesKind === 'dev' ? (
              <Text style={styles.devHint} allowFontScaling testID="opponents-dev-roster">
                DEV roster
              </Text>
            ) : null}
            <Text style={styles.rangeHint} allowFontScaling testID="opponents-range">
              {rangeStart}–{rangeEnd} of {candidates.length}
            </Text>
            <SnapVerticalList
              data={candidates}
              itemSize={OPPONENTS_LIST.cardHeight}
              gap={OPPONENTS_LIST.gap}
              // Exact 3-card viewport: no exact-fit side pad (avoids empty gap under
              // the counter that clipped the third card). Metrics unchanged.
              sidePadding={0}
              clipHeight={OPPONENTS_LIST.trackHeight}
              designVisibleCount={OPPONENTS_LIST.visibleCount}
              onSnapIndexChange={setSnapIndex}
              keyExtractor={(c: OpponentCandidate) => c.characterId}
              style={styles.list}
              testID="opponents-snap-list"
              renderItem={({ item: c }) => {
                const isSelected = selected?.characterId === c.characterId;
                const name = playerFacingDisplayName(c.displayName);
                const panel = a6OpponentPanelForCandidate({
                  characterId: c.characterId,
                  displayName: c.displayName,
                  paint: c.loadout.paint,
                  weapon: c.loadout.weapon,
                });
                const botoreName =
                  typeof c.botoreName === 'string' && c.botoreName.trim().length > 0
                    ? playerFacingDisplayName(c.botoreName)
                    : null;
                const hasRecord =
                  typeof c.wins === 'number' &&
                  Number.isFinite(c.wins) &&
                  typeof c.losses === 'number' &&
                  Number.isFinite(c.losses);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${name}${botoreName ? `, ${botoreName}` : ''}${
                      hasRecord ? `, ${c.wins} wins ${c.losses} losses` : ''
                    }${isSelected ? ', selected' : ''}`}
                    onPress={() => {
                      selectOpponent(c);
                    }}
                    style={[styles.card, isSelected ? styles.cardSelected : null]}
                    testID={`opponent-${c.characterId}`}
                  >
                    <View style={styles.preview} testID={`opponent-preview-wrap-${c.characterId}`}>
                      {panel ? (
                        <Image
                          source={panel}
                          style={styles.panelArt}
                          resizeMode="contain"
                          accessibilityIgnoresInvertColors
                          testID={`opponent-preview-panel-${c.characterId}`}
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
                          size={OPPONENTS_LIST.robotBodyHeight}
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
                      {botoreName ? (
                        <Text
                          style={styles.botore}
                          numberOfLines={1}
                          allowFontScaling
                          testID={`opponent-botore-${c.characterId}`}
                        >
                          {botoreName}
                        </Text>
                      ) : null}
                      {hasRecord ? (
                        <>
                          <View style={styles.recordRule} />
                          <Text
                            style={styles.record}
                            allowFontScaling
                            testID={`opponent-record-${c.characterId}`}
                          >
                            <Text style={styles.recordNum}>{c.wins}</Text>W –{' '}
                            <Text style={styles.recordNum}>{c.losses}</Text>L
                          </Text>
                        </>
                      ) : null}
                    </View>
                    <SelectionCheck selected={isSelected} style={styles.check} />
                  </Pressable>
                );
              }}
            />
          </>
        ) : null}
      </View>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
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
  },
  rangeHint: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.4,
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
  list: {
    flexGrow: 0,
    flexShrink: 0,
  },
  card: {
    height: OPPONENTS_LIST.cardHeight,
    flexDirection: 'row',
    alignItems: 'stretch',
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
  preview: {
    width: OPPONENTS_LIST.artPanelWidth,
    height: OPPONENTS_LIST.artPanelHeight,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    borderRightWidth: garageTag.outline,
    borderRightColor: garageTag.graphite,
    backgroundColor: '#e3cfa9',
    overflow: 'hidden',
  },
  panelArt: {
    width: OPPONENTS_LIST.artPanelWidth,
    height: OPPONENTS_LIST.artPanelHeight,
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
  recordRule: {
    marginTop: 10,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderTopColor: 'rgba(48,45,39,0.3)',
    paddingTop: 10,
  },
  record: {
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
});
