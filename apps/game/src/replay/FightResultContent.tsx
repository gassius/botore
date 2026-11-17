/**
 * Domain fight-result body — Garage Tag surfaces only.
 * Shell owns ScreenChrome / header / footer; this module does not duplicate shell.
 *
 * Plays Result UI cues: NEW RECORD stamp (after win delay) + XP bar ticks (gated).
 * C17: no UUIDs, checksums, raw character/part ids, or server-debug badges.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  XP_TICK_MIN_INTERVAL_MS,
  createXpTickGate,
  shouldPlayNewRecordCue,
  shouldShowNewRecordStamp,
  xpTickVariation,
} from '../audio';
import { useTrialUiAudio } from '../audio/useTrialUiAudio';
import { GaragePanel, Nameplate, garageTag } from '../garage-tag';
import { paintDisplayLabel, weaponDisplayLabel } from '../garage/loadout/proofCatalogue';
import type { ConfirmedFightResult } from './confirmedResult';
import { fighterDisplayName, formatOutcomeLine } from './confirmedResult';

export interface FightResultContentProps {
  readonly confirmed: ConfirmedFightResult;
  readonly testID?: string;
  /** Master mute — defaults unmuted when omitted (shell should pass player prefs). */
  readonly muted?: boolean;
  readonly musicEnabled?: boolean;
  readonly effectsEnabled?: boolean;
  /** Injected RNG for XP tick variation (tests). Defaults to Math.random. */
  readonly rng01?: () => number;
  /** Override "now" for deterministic cue timing in tests. */
  readonly nowMs?: () => number;
}

export function FightResultContent({
  confirmed,
  testID = 'fight-result-content',
  muted = false,
  musicEnabled = true,
  effectsEnabled = true,
  rng01,
  nowMs,
}: FightResultContentProps): React.ReactElement {
  const fighters = confirmed.replay.fighters;
  const outcomeLine = formatOutcomeLine(confirmed.outcome, fighters);
  const winnerId =
    confirmed.outcome.reason === 'defeat'
      ? confirmed.outcome.winner
      : confirmed.outcome.winnerByTiebreak;
  const winnerLabel = winnerId ? fighterDisplayName(winnerId, fighters) : null;
  const isDraw = !winnerId;
  const attackerName = fighterDisplayName(fighters[0]?.characterId, fighters);
  const defenderName = fighterDisplayName(fighters[1]?.characterId, fighters);
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const showNewRecord = useMemo(
    () => shouldShowNewRecordStamp({ serverNewRecord: confirmed.newRecord }),
    [confirmed.newRecord],
  );
  const xpTarget = confirmed.serverConfirmed ? Math.max(0, confirmed.xpAwarded ?? 0) : 0;
  const [stampVisible, setStampVisible] = useState(false);
  const [xpDisplay, setXpDisplay] = useState(0);
  const xpGateRef = useRef(createXpTickGate());
  const audioRef = useRef(uiAudio);
  audioRef.current = uiAudio;
  const rngRef = useRef(rng01 ?? (() => Math.random()));
  rngRef.current = rng01 ?? (() => Math.random());
  const nowRef = useRef(nowMs ?? (() => Date.now()));
  nowRef.current = nowMs ?? (() => Date.now());

  useEffect(() => {
    if (!showNewRecord) {
      setStampVisible(false);
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
    return () => {
      clearTimeout(timer);
    };
  }, [showNewRecord, confirmed.battleId]);

  useEffect(() => {
    xpGateRef.current.reset();
    setXpDisplay(0);
    if (xpTarget <= 0) return;

    let step = 0;
    const timer = setInterval(() => {
      const now = nowRef.current();
      if (!xpGateRef.current.shouldPlay(now)) return;
      step += 1;
      setXpDisplay(step);
      const variation = xpTickVariation(() => rngRef.current());
      audioRef.current.playCue('xpTick', {
        rate: variation.rate,
        volumeScale: variation.volumeScale,
      });
      if (step >= xpTarget) {
        clearInterval(timer);
      }
    }, XP_TICK_MIN_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [xpTarget, confirmed.battleId]);

  return (
    <View style={styles.root} testID={testID}>
      <Nameplate
        name={winnerLabel ?? outcomeLine}
        badge={isDraw ? 'Result' : 'Winner'}
        testID={`${testID}-outcome`}
      />

      <View style={styles.stampSlot} testID={`${testID}-new-record-slot`}>
        {stampVisible ? (
          <Text style={styles.newRecord} testID={`${testID}-new-record`} allowFontScaling>
            NEW RECORD
          </Text>
        ) : null}
      </View>

      <GaragePanel style={styles.panel} testID={`${testID}-progression`}>
        <Text style={styles.panelTitle} allowFontScaling>
          Progression
        </Text>
        {confirmed.serverConfirmed ? (
          <>
            <Text style={styles.xp} allowFontScaling testID={`${testID}-xp`}>
              XP awarded: {xpDisplay}
              {xpTarget > xpDisplay ? ` / ${xpTarget}` : ''}
            </Text>
            <View
              style={styles.xpTrack}
              testID={`${testID}-xp-bar`}
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: Math.max(xpTarget, 1),
                now: xpDisplay,
              }}
            >
              <View
                style={[
                  styles.xpFill,
                  { width: `${xpTarget > 0 ? (xpDisplay / xpTarget) * 100 : 0}%` },
                ]}
              />
            </View>
            <Text style={styles.meta} allowFontScaling>
              Allowances remaining: {confirmed.allowancesRemaining}
            </Text>
          </>
        ) : (
          <Text style={styles.meta} allowFontScaling>
            XP and allowances appear after a confirmed fight.
          </Text>
        )}
      </GaragePanel>

      <GaragePanel style={styles.panel} testID={`${testID}-builds`}>
        <Text style={styles.panelTitle} allowFontScaling>
          Bots
        </Text>
        <Text style={styles.line} allowFontScaling>
          {attackerName}: {paintDisplayLabel(confirmed.builds.attacker.paint)} ·{' '}
          {weaponDisplayLabel(confirmed.builds.attacker.weapon)}
        </Text>
        <Text style={styles.line} allowFontScaling>
          {defenderName}: {paintDisplayLabel(confirmed.builds.defender.paint)} ·{' '}
          {weaponDisplayLabel(confirmed.builds.defender.weapon)}
        </Text>
      </GaragePanel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  stampSlot: {
    minHeight: 28,
    justifyContent: 'center',
  },
  newRecord: {
    color: garageTag.oxide,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
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
    lineHeight: 20,
  },
  xp: {
    fontWeight: '800',
    fontSize: 15,
    color: garageTag.graphite,
    marginTop: 4,
  },
  xpTrack: {
    height: 10,
    marginTop: 6,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: garageTag.mustard,
  },
  meta: {
    fontWeight: '700',
    fontSize: 12,
    color: garageTag.steel,
    lineHeight: 18,
  },
});
