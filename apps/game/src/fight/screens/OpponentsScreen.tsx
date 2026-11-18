import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  weaponGlyphSource,
} from '../../garage-tag';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { paintUiAlias, weaponUiAlias } from '../../garage/loadout/proofCatalogue';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import { canContinueToConfirm } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';
import type { OpponentCandidate } from '../candidates/types';

/** Opponents domain — mounts into shell Opponents slot. */
export function OpponentsScreen(props: {
  onBack: () => void;
  onContinue: () => void;
}): React.ReactElement {
  const { canProgress, loadout, signOut } = useGarageSession();
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
            onPress={props.onContinue}
            testID="opponents-continue"
          />
          {list.status === 'error' || failureKind ? (
            <PrimaryButton
              label={failureKind ? sessionFailureCopy(failureKind).actionLabel : 'Retry'}
              onPress={() => {
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
        <ScreenHeader title="Opponents" onBack={props.onBack} />

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

        {noAllowance && !recoverable ? (
          <StatusErrorBanner
            title="No fight allowance left"
            detail="Your daily fight slots are used. Come back after UTC midnight — allowance is server-owned."
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
            <Text style={styles.allowance} allowFontScaling testID="opponents-allowance">
              Allowance remaining today: {list.allowancesRemaining}
              {candidatesKind === 'dev' ? ' · DEV roster' : ''}
            </Text>
            <Text style={styles.rangeHint} allowFontScaling testID="opponents-range">
              {rangeStart}–{rangeEnd} of {candidates.length}
            </Text>
            <SnapVerticalList
              data={candidates}
              itemSize={OPPONENTS_LIST.cardHeight}
              gap={OPPONENTS_LIST.gap}
              designVisibleCount={OPPONENTS_LIST.visibleCount}
              onSnapIndexChange={setSnapIndex}
              keyExtractor={(c: OpponentCandidate) => c.characterId}
              style={styles.list}
              testID="opponents-snap-list"
              renderItem={({ item: c }) => {
                const isSelected = selected?.characterId === c.characterId;
                const weapon = weaponUiAlias(c.loadout.weapon);
                const paint = paintUiAlias(c.loadout.paint);
                const name = playerFacingDisplayName(c.displayName);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${name}, ${weapon}${isSelected ? ', selected' : ''}`}
                    onPress={() => {
                      selectOpponent(c);
                    }}
                    style={[styles.card, isSelected ? styles.cardSelected : null]}
                    testID={`opponent-${c.characterId}`}
                  >
                    <View style={styles.preview} testID={`opponent-preview-wrap-${c.characterId}`}>
                      <BotAssemblerSlot
                        loadout={{
                          chassisId: c.loadout.chassis,
                          paintId: c.loadout.paint,
                          weaponId: c.loadout.weapon,
                        }}
                        facing="left"
                        paintId={c.loadout.paint}
                        weaponId={c.loadout.weapon}
                        size={112}
                        reducedMotion
                        motionPose="idle"
                        testID={`opponent-preview-${c.characterId}`}
                      />
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.name} numberOfLines={2} allowFontScaling>
                        {name}
                      </Text>
                      <Text style={styles.paint} allowFontScaling>
                        Paint · {paint}
                      </Text>
                      <View style={styles.weaponChip} testID={`opponent-weapon-${c.characterId}`}>
                        <Image
                          source={weaponGlyphSource(weapon)}
                          style={styles.weaponGlyph}
                          resizeMode="contain"
                          accessibilityIgnoresInvertColors
                        />
                        <Text style={styles.weaponLabel} allowFontScaling>
                          {weapon}
                        </Text>
                      </View>
                    </View>
                    <SelectionCheck selected={isSelected} />
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
  allowance: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  rangeHint: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.4,
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  card: {
    height: OPPONENTS_LIST.cardHeight,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: garageTag.cream,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    overflow: 'hidden',
  },
  cardSelected: {
    borderWidth: 4,
    borderColor: garageTag.mustard,
  },
  preview: {
    width: 120,
    paddingTop: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  metaCol: {
    flex: 1,
    gap: 8,
    minWidth: 0,
    paddingTop: 8,
    paddingRight: 28,
  },
  name: {
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  paint: {
    fontWeight: '700',
    fontSize: 11,
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
  weaponChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
  },
  weaponGlyph: {
    width: 28,
    height: 28,
  },
  weaponLabel: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
});
