/**
 * Domain fight-result body — Garage Tag surfaces only.
 * Shell owns ScreenChrome / header / footer; this module does not duplicate shell.
 *
 * Plays Result UI cues: NEW RECORD stamp (after win delay) + XP bar ticks (gated).
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
import type { ConfirmedFightResult } from './confirmedResult';
import { formatOutcomeLine } from './confirmedResult';

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
  const outcomeLine = formatOutcomeLine(confirmed.outcome);
  const winnerName =
    confirmed.outcome.reason === 'defeat'
      ? confirmed.outcome.winner
      : confirmed.outcome.winnerByTiebreak;
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
      <Text style={styles.source} testID={`${testID}-source`} allowFontScaling>
        {confirmed.label === 'DEV' ? 'DEV — not server-confirmed' : 'CONFIRMED'}
      </Text>

      <Nameplate
        name={outcomeLine}
        {...(winnerName ? { badge: 'Result' } : {})}
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
        <Text style={styles.line} allowFontScaling>
          Battle {confirmed.battleId}
        </Text>
        <Text style={styles.meta} allowFontScaling>
          Rules {confirmed.rulesVersion} · checksum {confirmed.replayChecksum.slice(0, 12)}…
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
