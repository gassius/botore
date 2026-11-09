import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  SelectionCheck,
  StatusErrorBanner,
  garageTag,
  weaponGlyphSource,
} from '../../garage-tag';
import { useGarageSession } from '../../garage/LoadoutSessionContext';
import { paintUiAlias, weaponUiAlias } from '../../garage/loadout/proofCatalogue';
import { canContinueToConfirm } from '../fightSessionLifecycle';
import { useFightSession } from '../FightSessionContext';

/** Opponents domain — mounts into shell Opponents slot. */
export function OpponentsScreen(props: {
  onBack: () => void;
  onContinue: () => void;
}): React.ReactElement {
  const { canProgress, loadout } = useGarageSession();
  const {
    list,
    selected,
    candidatesKind,
    pendingIntent,
    fightInFlight,
    refreshCandidates,
    selectOpponent,
  } = useFightSession();

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

  const noAllowance =
    list.status === 'ready' && list.allowancesRemaining < 1
      ? true
      : list.status === 'error' && list.code === 'allowance_exhausted';

  const emptyCandidates = list.status === 'ready' && list.candidates.length === 0;
  const networkError = list.status === 'error' && list.code === 'network_error';
  const otherError =
    list.status === 'error' && !networkError && list.code !== 'allowance_exhausted';

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

  return (
    <ScreenChrome
      testID="slot-opponents"
      footer={
        <>
          <PrimaryButton
            label={recoverable && noAllowance ? 'Recover fight' : 'Continue'}
            disabled={!canContinue || fightInFlight}
            onPress={props.onContinue}
            testID="opponents-continue"
          />
          {list.status === 'error' ? (
            <PrimaryButton
              label="Retry"
              onPress={() => {
                void refreshCandidates();
              }}
              testID="opponents-retry"
            />
          ) : null}
        </>
      }
    >
      <ScreenHeader title="Opponents" onBack={props.onBack} />

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

      {emptyCandidates ? (
        <StatusErrorBanner
          title="No opponents available"
          detail="No system opponents with a confirmed loadout are readable right now."
          testID="opponents-empty"
        />
      ) : null}

      {networkError ? (
        <StatusErrorBanner
          title="Network failure"
          detail={list.status === 'error' ? list.message : 'Could not reach the server.'}
          testID="opponents-network-error"
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
          <Text style={styles.allowance} allowFontScaling testID="opponents-allowance">
            Allowance remaining today: {list.allowancesRemaining}
            {candidatesKind === 'dev' ? ' · DEV roster' : ''}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {list.candidates.map((c) => {
              const isSelected = selected?.characterId === c.characterId;
              const weapon = weaponUiAlias(c.loadout.weapon);
              const paint = paintUiAlias(c.loadout.paint);
              return (
                <Pressable
                  key={c.characterId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${c.displayName}, ${weapon}${isSelected ? ', selected' : ''}`}
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
                      size={96}
                      reducedMotion
                      motionPose="idle"
                      testID={`opponent-preview-${c.characterId}`}
                    />
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.name} numberOfLines={2} allowFontScaling>
                      {c.displayName}
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
            })}
          </ScrollView>
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
  allowance: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 460,
  },
  list: {
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 128,
    padding: 12,
    backgroundColor: garageTag.cream,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
  },
  cardSelected: {
    borderWidth: 4,
    borderColor: garageTag.mustard,
  },
  preview: {
    width: 104,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaCol: {
    flex: 1,
    gap: 6,
    minWidth: 0,
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
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
  },
  weaponGlyph: {
    width: 22,
    height: 22,
  },
  weaponLabel: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
});
