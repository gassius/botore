/**
 * D2 Result overlay — VICTORY/DEFEAT plate + player pose + XP card over dimmed arena.
 * Player POV only; no battle ids, checksums, or server-debug chrome.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import {
  XP_TICK_MIN_INTERVAL_MS,
  createXpTickGate,
  shouldPlayNewRecordCue,
  xpTickVariation,
} from '../audio';
import { useTrialUiAudio } from '../audio/useTrialUiAudio';
import { garageTag } from '../garage-tag';
import { ResultDefeatPose, ResultPlate, ResultVictoryPoseSlot } from '../result-art';
import { assemblerLoadoutFromBuild } from '../replay/fighterLoadout';
import type { ConfirmedFightResult } from '../replay/confirmedResult';
import { buildResultCardModel } from './resultCardModel';
import type { BotFightRecordSnapshot } from './types';
import { RESULT_OVERLAY_DIM_OPACITY, RESULT_PLATE_DROP_MS } from './types';

export type ResultOverlayProps = {
  readonly confirmed: ConfirmedFightResult;
  readonly record?: BotFightRecordSnapshot | null;
  readonly opponentBotoreName?: string | null;
  readonly muted?: boolean;
  readonly musicEnabled?: boolean;
  readonly effectsEnabled?: boolean;
  readonly reducedMotion?: boolean;
  /** Fade HUD under the dim (parent should also hide call-outs). */
  readonly hudOpacity?: number;
  readonly rng01?: () => number;
  readonly nowMs?: () => number;
  readonly testID?: string;
};

export function ResultOverlay({
  confirmed,
  record = null,
  opponentBotoreName = null,
  muted = false,
  musicEnabled = true,
  effectsEnabled = true,
  reducedMotion = false,
  rng01,
  nowMs,
  testID = 'result-overlay',
}: ResultOverlayProps): React.ReactElement {
  const card = useMemo(
    () => buildResultCardModel(confirmed, { record, opponentBotoreName }),
    [confirmed, record, opponentBotoreName],
  );
  const loadout = useMemo(
    () => assemblerLoadoutFromBuild(confirmed.builds.attacker),
    [confirmed.builds.attacker],
  );
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const plateDrop = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const [stampVisible, setStampVisible] = useState(reducedMotion && card.showNewRecord);
  const [xpDisplay, setXpDisplay] = useState(reducedMotion ? card.xpAwarded : 0);
  const [barGainWidth, setBarGainWidth] = useState(
    reducedMotion ? Math.max(0, card.xpBarNewRatio - card.xpBarOldRatio) : 0,
  );
  const xpGateRef = useRef(createXpTickGate());
  const audioRef = useRef(uiAudio);
  audioRef.current = uiAudio;
  const rngRef = useRef(rng01 ?? (() => Math.random()));
  rngRef.current = rng01 ?? (() => Math.random());
  const nowRef = useRef(nowMs ?? (() => Date.now()));
  nowRef.current = nowMs ?? (() => Date.now());
  const fightKey = `${card.outcomeKind}|${card.xpAwarded}|${card.showNewRecord}|${card.wins}|${card.losses}`;

  useEffect(() => {
    if (reducedMotion) {
      plateDrop.setValue(1);
      return;
    }
    plateDrop.setValue(0);
    const anim = Animated.timing(plateDrop, {
      toValue: 1,
      duration: RESULT_PLATE_DROP_MS,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [plateDrop, reducedMotion, fightKey]);

  useEffect(() => {
    if (!card.showNewRecord) {
      setStampVisible(false);
      return;
    }
    if (reducedMotion) {
      setStampVisible(true);
      audioRef.current.playCue('newRecord');
      return;
    }
    const startedAt = nowRef.current();
    const delayMs = 400;
    const timer = setTimeout(() => {
      const elapsed = nowRef.current() - startedAt;
      if (
        !shouldPlayNewRecordCue({
          isNewRecord: true,
          winStarted: true,
          msSinceWinStart: Math.max(elapsed, delayMs),
        })
      ) {
        return;
      }
      setStampVisible(true);
      audioRef.current.playCue('newRecord');
    }, delayMs);
    return () => clearTimeout(timer);
  }, [card.showNewRecord, fightKey, reducedMotion]);

  useEffect(() => {
    xpGateRef.current.reset();
    const target = card.xpAwarded;
    const gainSpan = Math.max(0, card.xpBarNewRatio - card.xpBarOldRatio);
    if (reducedMotion || target <= 0) {
      setXpDisplay(target);
      setBarGainWidth(gainSpan);
      return;
    }
    setXpDisplay(0);
    setBarGainWidth(0);
    let step = 0;
    const timer = setInterval(() => {
      const now = nowRef.current();
      if (!xpGateRef.current.shouldPlay(now)) return;
      step += 1;
      setXpDisplay(step);
      setBarGainWidth(gainSpan * (step / target));
      const variation = xpTickVariation(() => rngRef.current());
      audioRef.current.playCue('xpTick', {
        rate: variation.rate,
        volumeScale: variation.volumeScale,
      });
      if (step >= target) clearInterval(timer);
    }, XP_TICK_MIN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [card.xpAwarded, card.xpBarOldRatio, card.xpBarNewRatio, fightKey, reducedMotion]);

  const plateTranslate = plateDrop.interpolate({
    inputRange: [0, 1],
    outputRange: [-48, 0],
  });
  const isVictory = card.outcomeKind === 'victory';
  const isDefeat = card.outcomeKind === 'defeat';
  const plateKind = isDefeat ? 'defeat' : 'victory';

  return (
    <View style={styles.root} pointerEvents="box-none" testID={testID}>
      <View
        style={[styles.dim, { opacity: RESULT_OVERLAY_DIM_OPACITY }]}
        testID={`${testID}-dim`}
        pointerEvents="none"
      />
      <View style={styles.content} testID={`${testID}-content`}>
        <Animated.View
          style={[
            styles.plateWrap,
            {
              opacity: plateDrop,
              transform: [{ translateY: plateTranslate }, { rotate: isDefeat ? '2deg' : '-2deg' }],
            },
          ]}
          testID={`${testID}-plate-wrap`}
        >
          <ResultPlate kind={plateKind} widthPt={280} testID={`${testID}-plate`} />
        </Animated.View>

        <View style={styles.poseWrap} testID={`${testID}-pose`}>
          {isVictory ? (
            <ResultVictoryPoseSlot
              loadout={loadout}
              size={260}
              reducedMotion={reducedMotion}
              testID={`${testID}-victory-pose`}
            />
          ) : (
            <ResultDefeatPose
              loadout={loadout}
              size={260}
              reducedMotion={reducedMotion}
              testID={`${testID}-defeat-pose`}
            />
          )}
        </View>

        <View style={styles.card} testID={`${testID}-card`}>
          {stampVisible ? (
            <View style={styles.stampSlot} testID={`${testID}-new-record-slot`}>
              <ResultPlate kind="new_record" widthPt={118} testID={`${testID}-new-record`} />
            </View>
          ) : (
            <View style={styles.stampSlot} testID={`${testID}-new-record-slot`} />
          )}
          <View style={styles.row}>
            <Text style={styles.xp} allowFontScaling testID={`${testID}-xp`}>
              +{xpDisplay} XP
            </Text>
            {card.levelLabel ? (
              <Text style={styles.level} allowFontScaling testID={`${testID}-level`}>
                {card.levelLabel}
              </Text>
            ) : null}
          </View>
          <View
            style={styles.bar}
            testID={`${testID}-xp-bar`}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(card.xpBarOldRatio * 100 + barGainWidth * 100),
            }}
          >
            <View
              style={[styles.barOld, { width: `${card.xpBarOldRatio * 100}%` }]}
              testID={`${testID}-xp-bar-old`}
            />
            <View
              style={[
                styles.barGain,
                {
                  left: `${card.xpBarOldRatio * 100}%`,
                  width: `${barGainWidth * 100}%`,
                },
              ]}
              testID={`${testID}-xp-bar-gain`}
            />
          </View>
          {card.wins !== null && card.losses !== null ? (
            <View style={styles.row2}>
              <Text style={styles.record} allowFontScaling testID={`${testID}-record`}>
                Record{' '}
                <Text style={styles.recordBold}>
                  {card.wins}W – {card.losses}L
                </Text>
              </Text>
              {card.contextLine ? (
                <Text style={styles.context} allowFontScaling testID={`${testID}-context`}>
                  {card.contextLine}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={styles.vsLine} allowFontScaling testID={`${testID}-vs`}>
          {card.vsLine}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    // Semi-transparent ink — never an opaque #111 fill that hides the arena.
    backgroundColor: '#1e1c18',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: 34,
  },
  plateWrap: {
    zIndex: 2,
  },
  poseWrap: {
    marginTop: -14,
    zIndex: 1,
  },
  card: {
    width: 318,
    marginTop: 4,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: garageTag.cream,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 9,
    position: 'relative',
  },
  stampSlot: {
    position: 'absolute',
    right: -14,
    top: -30,
    minWidth: 40,
    minHeight: 40,
    zIndex: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  xp: {
    fontSize: 26,
    fontWeight: '900',
    color: garageTag.graphite,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b6356',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bar: {
    height: 16,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 5,
    backgroundColor: '#d8c6a4',
    marginTop: 8,
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  barOld: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: garageTag.oxide,
  },
  barGain: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: garageTag.mustard,
  },
  row2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  record: {
    fontSize: 13,
    fontWeight: '600',
    color: garageTag.graphite,
  },
  recordBold: {
    fontSize: 17,
    fontWeight: '900',
  },
  context: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b6356',
    flexShrink: 1,
    textAlign: 'right',
  },
  vsLine: {
    marginTop: 14,
    color: '#e8dac0',
    fontSize: 13,
    fontWeight: '500',
  },
});
