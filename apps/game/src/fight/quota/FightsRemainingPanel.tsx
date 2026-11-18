import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../../garage-tag';
import type { FightQuotaSummary } from './fightQuotaTypes';
import { useRefillCountdown } from './useRefillCountdown';

export type FightsRemainingPanelProps = {
  readonly quota: FightQuotaSummary;
  /** D9 compact strip under the tape table. */
  readonly compact?: boolean;
  readonly testID?: string;
};

/**
 * Shared Fights Remaining readout (D8 Opponents + D9 Tale of the Tape).
 * Limit / refill come only from the server quota — no "today" / "UTC" copy.
 */
export function FightsRemainingPanel(props: FightsRemainingPanelProps): React.ReactElement {
  const { quota, compact = false, testID = 'fights-remaining-panel' } = props;
  const remaining = Math.max(0, quota.fightsRemaining);
  const limit = Math.max(1, quota.limit);
  const isFull = remaining >= limit;
  const isEmpty = remaining < 1;
  const countdown = useRefillCountdown(isFull ? null : quota.nextRefillAt);

  const pips = Array.from({ length: limit }, (_, i) => i < remaining);

  return (
    <View
      style={[styles.root, compact ? styles.rootCompact : null, isEmpty ? styles.rootEmpty : null]}
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={
        isFull
          ? `Fights remaining ${remaining} of ${limit}, full`
          : `Fights remaining ${remaining} of ${limit}, next fight in ${countdown.label}`
      }
    >
      <View style={styles.left}>
        <Text
          style={[
            styles.ratio,
            compact ? styles.ratioCompact : null,
            isEmpty ? styles.ratioEmpty : null,
          ]}
          allowFontScaling
          testID={`${testID}-ratio`}
        >
          {remaining}
          <Text style={styles.ratioLimit}> / {limit}</Text>
        </Text>
        <Text style={[styles.label, compact ? styles.labelCompact : null]} allowFontScaling>
          Fights remaining
        </Text>
        <View style={styles.pips} testID={`${testID}-pips`}>
          {pips.map((filled, i) => (
            <View
              key={`pip-${i}`}
              style={[styles.pip, filled ? styles.pipFilled : styles.pipEmpty]}
              testID={`${testID}-pip-${i}`}
            />
          ))}
        </View>
      </View>
      <View style={styles.right}>
        {isFull ? (
          <Text style={styles.full} allowFontScaling testID={`${testID}-full`}>
            Full
          </Text>
        ) : (
          <>
            <Text
              style={[styles.nextLabel, isEmpty ? styles.nextLabelHero : null]}
              allowFontScaling
            >
              Next fight in
            </Text>
            <Text
              style={[
                styles.countdown,
                compact ? styles.countdownCompact : null,
                isEmpty ? styles.countdownHero : null,
              ]}
              allowFontScaling
              testID={`${testID}-countdown`}
            >
              {countdown.label}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: garageTag.cream,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    marginBottom: 10,
  },
  rootCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rootEmpty: {
    borderColor: garageTag.oxide,
  },
  left: {
    flexShrink: 1,
    gap: 4,
    minWidth: 0,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ratio: {
    fontWeight: '900',
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: 0.5,
    color: garageTag.graphite,
  },
  ratioCompact: {
    fontSize: 28,
    lineHeight: 32,
  },
  ratioEmpty: {
    color: garageTag.oxide,
  },
  ratioLimit: {
    fontWeight: '800',
    fontSize: 22,
    color: garageTag.steel,
  },
  label: {
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  labelCompact: {
    fontSize: 10,
  },
  pips: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  pip: {
    width: 10,
    height: 10,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: garageTag.graphite,
  },
  pipFilled: {
    backgroundColor: garageTag.mustard,
  },
  pipEmpty: {
    backgroundColor: garageTag.paper,
  },
  full: {
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  nextLabel: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.steel,
    textAlign: 'right',
  },
  nextLabelHero: {
    color: garageTag.graphite,
  },
  countdown: {
    fontWeight: '900',
    fontSize: 20,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
    color: garageTag.graphite,
    textAlign: 'right',
  },
  countdownCompact: {
    fontSize: 16,
  },
  countdownHero: {
    fontSize: 24,
    color: garageTag.oxide,
  },
});
