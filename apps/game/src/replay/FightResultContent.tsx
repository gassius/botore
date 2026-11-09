/**
 * Domain fight-result body — Garage Tag surfaces only.
 * Shell owns ScreenChrome / header / footer; this module does not duplicate shell.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GaragePanel, Nameplate, garageTag } from '../garage-tag';
import type { ConfirmedFightResult } from './confirmedResult';
import { formatOutcomeLine } from './confirmedResult';

export interface FightResultContentProps {
  readonly confirmed: ConfirmedFightResult;
  readonly testID?: string;
}

export function FightResultContent({
  confirmed,
  testID = 'fight-result-content',
}: FightResultContentProps): React.ReactElement {
  const outcomeLine = formatOutcomeLine(confirmed.outcome);
  const winnerName =
    confirmed.outcome.reason === 'defeat'
      ? confirmed.outcome.winner
      : confirmed.outcome.winnerByTiebreak;

  return (
    <View style={styles.root} testID={testID}>
      <Text style={styles.source} testID={`${testID}-source`} allowFontScaling>
        {confirmed.label === 'DEV' ? 'DEV — not server-confirmed' : 'CONFIRMED'}
      </Text>

      <Nameplate
        name={outcomeLine}
        {...(winnerName ? { badge: 'Result' } : {})}
        testID={`${testID}-outcome`}
      />

      <GaragePanel style={styles.panel} testID={`${testID}-progression`}>
        <Text style={styles.panelTitle} allowFontScaling>
          Progression
        </Text>
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
      </GaragePanel>

      <GaragePanel style={styles.panel} testID={`${testID}-builds`}>
        <Text style={styles.panelTitle} allowFontScaling>
          Stored builds
        </Text>
        <Text style={styles.meta} allowFontScaling>
          Attacker: {confirmed.builds.attacker.paint} · {confirmed.builds.attacker.weapon}
          {confirmed.builds.attacker.loadoutVersionId
            ? ` · ${confirmed.builds.attacker.loadoutVersionId}`
            : ''}
        </Text>
        <Text style={styles.meta} allowFontScaling>
          Defender: {confirmed.builds.defender.paint} · {confirmed.builds.defender.weapon}
          {confirmed.builds.defender.loadoutVersionId
            ? ` · ${confirmed.builds.defender.loadoutVersionId}`
            : ''}
        </Text>
        <Text style={styles.meta} allowFontScaling>
          Media: env {confirmed.media.environmentVersion} · kit {confirmed.media.kitVersion}
          {confirmed.media.atlasVersions
            ? ` · atlas ${confirmed.media.atlasVersions.attacker}/${confirmed.media.atlasVersions.defender}`
            : ''}
        </Text>
      </GaragePanel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  source: {
    color: garageTag.mustard,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  panel: {
    marginTop: 0,
  },
  panelTitle: {
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    marginBottom: 6,
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
    marginTop: 4,
  },
  meta: {
    fontWeight: '700',
    fontSize: 12,
    color: garageTag.steel,
    lineHeight: 18,
  },
});
