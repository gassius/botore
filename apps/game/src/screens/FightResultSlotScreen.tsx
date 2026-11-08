/**
 * Shell FightResult slot — progression only from server-confirmed data.
 * DEV fixtures show outcome from sealed replay; XP/allowances stay unavailable.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatOutcomeLine, type ConfirmedFightResult } from '../replay/confirmedResult';
import { loadDevGoldenConfirmedResult } from '../replay/loadDevReplay';

export interface FightResultSlotScreenProps {
  readonly confirmed?: ConfirmedFightResult;
  readonly onWatchReplay?: () => void;
  readonly onDone?: () => void;
}

export const FightResultSlotScreen: React.FC<FightResultSlotScreenProps> = ({
  confirmed,
  onWatchReplay,
  onDone,
}) => {
  const result = useMemo(() => confirmed ?? loadDevGoldenConfirmedResult(0), [confirmed]);
  const winnerLine = formatOutcomeLine(result.outcome);

  return (
    <View style={styles.root} testID="fight-result-slot-screen">
      <Text style={styles.slotHint}>FightResult slot · F10</Text>
      <Text style={styles.labelBadge} testID="fight-result-source">
        {result.label === 'DEV' ? 'DEV — not server-confirmed' : 'CONFIRMED'}
      </Text>
      <Text style={styles.title} testID="fight-result-outcome">
        {winnerLine}
      </Text>
      <Text style={styles.meta}>Battle {result.battleId}</Text>
      <Text style={styles.meta}>Rules {result.rulesVersion}</Text>
      <Text style={styles.meta}>Checksum {result.replayChecksum.slice(0, 16)}…</Text>

      <View style={styles.card} testID="fight-result-progression">
        <Text style={styles.cardTitle}>Progression</Text>
        {result.serverConfirmed ? (
          <>
            <Text style={styles.cardLine}>XP awarded: {result.xpAwarded}</Text>
            <Text style={styles.cardLine}>Allowances remaining: {result.allowancesRemaining}</Text>
            <Text style={styles.cardLine}>UTC day: {result.utcDay}</Text>
            <Text style={styles.cardLine}>Persistence: {result.persistence}</Text>
          </>
        ) : (
          <Text style={styles.cardLine}>
            XP / allowances unavailable until F9 fight response. Outcome above is from the sealed
            recorded replay only — not invented by the client.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stored media (historical when present)</Text>
        <Text style={styles.cardLine}>Environment: {result.media.environmentVersion}</Text>
        <Text style={styles.cardLine}>Kit: {result.media.kitVersion}</Text>
        {result.media.atlasVersions ? (
          <Text style={styles.cardLine}>
            Atlas A/D: {result.media.atlasVersions.attacker} / {result.media.atlasVersions.defender}
          </Text>
        ) : (
          <Text style={styles.cardLine}>Atlas versions: (awaiting fight contract)</Text>
        )}
      </View>

      <View style={styles.spacer} />
      <View style={styles.actions}>
        <Pressable testID="fight-result-watch-replay" style={styles.btn} onPress={onWatchReplay}>
          <Text style={styles.btnText}>Watch replay</Text>
        </Pressable>
        <Pressable
          testID="fight-result-done"
          style={[styles.btn, styles.btnSecondary]}
          onPress={onDone}
        >
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1E2226',
    padding: 16,
    gap: 8,
  },
  slotHint: {
    color: '#9AA3AB',
    fontSize: 11,
    fontWeight: '700',
  },
  labelBadge: {
    color: '#E3B23C',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  title: {
    color: '#F3EADF',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  meta: {
    color: '#9AA3AB',
    fontSize: 12,
  },
  card: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#2A2E32',
    gap: 6,
  },
  cardTitle: {
    color: '#F3EADF',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 2,
  },
  cardLine: {
    color: '#D5DBE0',
    fontSize: 13,
    lineHeight: 18,
  },
  spacer: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#E3B23C',
    borderWidth: 2,
    borderColor: '#2A2E32',
    alignItems: 'center',
  },
  btnSecondary: {
    backgroundColor: '#F3EADF',
  },
  btnText: {
    fontWeight: '800',
    color: '#2A2E32',
  },
});
