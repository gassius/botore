import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  garageTag,
} from '../../garage-tag';
import { useFightSession } from '../../fight';
import { formatOutcomeLine } from '../../replay/confirmedResult';
import { resolveSessionConfirmedResult } from '../../replay/resolveSessionResult';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Shell FightResult slot — progression only from server-confirmed data.
 * Prefers F9 `lastFight` when replay validates; DEV fixtures withhold XP.
 */
export function FightResultSlot(): React.ReactElement {
  const { goTo, goNext } = useFirstRun();
  const { lastFight } = useFightSession();

  const confirmed = useMemo(() => resolveSessionConfirmedResult(lastFight), [lastFight]);

  const outcomeLine = formatOutcomeLine(confirmed.outcome);

  return (
    <ScreenChrome
      testID="slot-result"
      footer={
        <>
          <PrimaryButton
            label="Back to stable"
            onPress={() => goTo('Stable')}
            testID="result-stable"
          />
          <SecondaryButton
            label="Watch again"
            onPress={() => goTo('Replay')}
            testID="result-watch"
          />
          <SecondaryButton label="Ranking" onPress={goNext} testID="result-ranking" />
        </>
      }
    >
      <ScreenHeader title="Fight Result" />
      <Text style={styles.source} testID="fight-result-source" allowFontScaling>
        {confirmed.label === 'DEV' ? 'DEV — not server-confirmed' : 'CONFIRMED'}
      </Text>
      <View style={styles.banner}>
        <Text style={styles.bannerText} testID="fight-result-outcome" allowFontScaling>
          {outcomeLine}
        </Text>
      </View>
      <View style={styles.info} testID="fight-result-progression">
        <Text style={styles.line} allowFontScaling>
          Battle {confirmed.battleId}
        </Text>
        <Text style={styles.meta} allowFontScaling>
          Rules {confirmed.rulesVersion} · checksum {confirmed.replayChecksum.slice(0, 12)}…
        </Text>
        {confirmed.serverConfirmed ? (
          <>
            <Text style={styles.xp} allowFontScaling>
              XP awarded: {confirmed.xpAwarded}
            </Text>
            <Text style={styles.meta} allowFontScaling>
              Allowances remaining: {confirmed.allowancesRemaining}
            </Text>
            <Text style={styles.meta} allowFontScaling>
              UTC day: {confirmed.utcDay} · {confirmed.persistence}
            </Text>
          </>
        ) : (
          <Text style={styles.meta} allowFontScaling>
            XP / allowances unavailable until an F9 fight response. Outcome is from the sealed
            recorded replay only.
          </Text>
        )}
        <Text style={styles.meta} allowFontScaling>
          Media: env {confirmed.media.environmentVersion} · kit {confirmed.media.kitVersion}
          {confirmed.media.atlasVersions
            ? ` · atlas ${confirmed.media.atlasVersions.attacker}/${confirmed.media.atlasVersions.defender}`
            : ''}
        </Text>
      </View>
      <DomainNote text="Domain: F10 fight result. Never invent XP from REF samples or art." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  source: {
    color: garageTag.mustard,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  banner: {
    alignSelf: 'center',
    backgroundColor: garageTag.mustard,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginBottom: 12,
  },
  bannerText: {
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    textAlign: 'center',
  },
  info: {
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
    padding: 14,
    gap: 8,
  },
  line: {
    fontWeight: '800',
    fontSize: 14,
    color: garageTag.graphite,
  },
  xp: {
    fontWeight: '800',
    fontSize: 15,
    color: garageTag.graphite,
  },
  meta: {
    fontWeight: '700',
    fontSize: 12,
    color: garageTag.steel,
    lineHeight: 18,
  },
});
