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
  /** Fired once when countdown hits 0 — parent should refresh quota. */
  readonly onRefillDue?: () => void;
};

/**
 * Shared Fights Remaining readout (D8 Opponents + D9 Tale of the Tape mockup).
 * Layout: big n/limit · FIGHTS REMAINING + bar pips · Next fight in HH:MM:SS.
 * Limit / refill come only from the server quota — no "today" / "UTC" copy.
 */
export function FightsRemainingPanel(props: FightsRemainingPanelProps): React.ReactElement {
  const { quota, compact = false, testID = 'fights-remaining-panel', onRefillDue } = props;
  const remaining = Math.max(0, quota.fightsRemaining);
  const limit = Math.max(1, quota.limit);
  const isFull = remaining >= limit;
  const isEmpty = remaining < 1;
  const countdown = useRefillCountdown(isFull ? null : quota.nextRefillAt, onRefillDue);

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
        <Text style={[styles.ratioLimit, compact ? styles.ratioLimitCompact : null]}>
          {' '}
          / {limit}
        </Text>
      </Text>

      <View style={styles.mid}>
        <Text style={[styles.label, compact ? styles.labelCompact : null]} allowFontScaling>
          {`Fights\nremaining`}
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
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: garageTag.white,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: 9,
    marginBottom: 10,
    // Soft mechanical shadow matching mockup ink drop.
    shadowColor: garageTag.graphite,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  rootCompact: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rootEmpty: {
    borderColor: garageTag.oxide,
  },
  mid: {
    flexShrink: 1,
    gap: 4,
    minWidth: 0,
  },
  right: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ratio: {
    fontWeight: '900',
    fontSize: 40,
    lineHeight: 42,
    color: garageTag.graphite,
  },
  ratioCompact: {
    fontSize: 30,
    lineHeight: 32,
  },
  ratioEmpty: {
    color: garageTag.oxide,
  },
  ratioLimit: {
    fontWeight: '800',
    fontSize: 18,
    color: '#8a8070',
  },
  ratioLimitCompact: {
    fontSize: 15,
  },
  label: {
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    lineHeight: 13,
  },
  labelCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  pips: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  pip: {
    width: 22,
    height: 8,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: garageTag.graphite,
  },
  pipFilled: {
    backgroundColor: garageTag.mustard,
  },
  pipEmpty: {
    backgroundColor: '#e3d3b4',
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
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#6b6356',
    textAlign: 'right',
  },
  nextLabelHero: {
    color: garageTag.graphite,
  },
  countdown: {
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
    color: garageTag.graphite,
    textAlign: 'right',
  },
  countdownCompact: {
    fontSize: 18,
  },
  countdownHero: {
    fontSize: 24,
    color: garageTag.oxide,
  },
});
