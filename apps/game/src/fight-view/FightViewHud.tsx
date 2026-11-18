/**
 * In-arena HUD: bot names (caps) + botore labels + HP bars with mustard chip trail + VS.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../garage-tag';

export type FightViewHudSide = {
  readonly botName: string;
  /** Botore / owner line under the bot name — omit when unknown. */
  readonly ownerLabel?: string;
  /** Current HP ratio 0..1. */
  readonly hp: number;
  /** Fill colour (oxide left / petrol right). */
  readonly fillColor: string;
};

export type FightViewHudProps = {
  readonly near: FightViewHudSide;
  readonly far: FightViewHudSide;
  /** Safe-area top inset — arena stays full-bleed; HUD pads below the notch. */
  readonly topInset?: number;
  readonly testID?: string;
};

const CHIP_HOLD_MS = 700;

function useChipTrail(hp: number): number {
  const [chip, setChip] = useState(hp);
  const prevHp = useRef(hp);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previous = prevHp.current;
    prevHp.current = hp;
    if (hp < previous - 0.001) {
      // Damage: mustard chip holds at the pre-hit value, then catches up.
      setChip(previous);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setChip(hp), CHIP_HOLD_MS);
      return;
    }
    setChip((current) => (hp > current ? hp : current));
  }, [hp]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return Math.max(chip, hp);
}

function HudSide({
  side,
  align,
  testID,
}: {
  side: FightViewHudSide;
  align: 'left' | 'right';
  testID: string;
}): React.ReactElement {
  const chip = useChipTrail(side.hp);
  const fillPct = Math.max(0, Math.min(100, side.hp * 100));
  const chipPct = Math.max(fillPct, Math.min(100, chip * 100));
  const right = align === 'right';

  return (
    <View style={[styles.side, right ? styles.sideRight : null]} testID={testID}>
      <Text
        style={[styles.name, right ? styles.textRight : null]}
        numberOfLines={1}
        allowFontScaling
      >
        {side.botName}
      </Text>
      {side.ownerLabel ? (
        <Text
          style={[styles.owner, right ? styles.textRight : null]}
          numberOfLines={1}
          allowFontScaling
        >
          {side.ownerLabel}
        </Text>
      ) : (
        <View style={styles.ownerSpacer} />
      )}
      <View
        style={styles.hp}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(fillPct), min: 0, max: 100 }}
        testID={`${testID}-hp`}
      >
        <View
          style={[
            styles.chip,
            right ? styles.fillRight : styles.fillLeft,
            { width: `${chipPct}%` },
          ]}
          testID={`${testID}-chip`}
        />
        <View
          style={[
            styles.fill,
            right ? styles.fillRight : styles.fillLeft,
            { width: `${fillPct}%`, backgroundColor: side.fillColor },
          ]}
        />
      </View>
    </View>
  );
}

export function FightViewHud({
  near,
  far,
  topInset = 0,
  testID = 'fight-view-hud',
}: FightViewHudProps): React.ReactElement {
  return (
    <View
      style={[styles.root, { paddingTop: 12 + topInset }]}
      pointerEvents="box-none"
      testID={testID}
    >
      <View style={styles.row} pointerEvents="box-none">
        <HudSide side={near} align="left" testID={`${testID}-near`} />
        <HudSide side={far} align="right" testID={`${testID}-far`} />
      </View>
      <Text style={[styles.vs, { top: 14 + topInset }]} allowFontScaling testID={`${testID}-vs`}>
        VS
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 26,
    backgroundColor: 'rgba(36,33,29,0.72)',
    zIndex: 5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  side: {
    flex: 1,
    minWidth: 0,
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  name: {
    color: garageTag.white,
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 22,
  },
  owner: {
    color: '#d9c9ab',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  ownerSpacer: {
    height: 16,
  },
  textRight: {
    textAlign: 'right',
  },
  hp: {
    height: 14,
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    borderRadius: 4,
    backgroundColor: '#5a5247',
    marginTop: 7,
    overflow: 'hidden',
    width: '100%',
  },
  chip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: garageTag.mustard,
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  fillLeft: {
    left: 0,
  },
  fillRight: {
    right: 0,
  },
  vs: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: garageTag.mustard,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 2,
    zIndex: 6,
  },
});
