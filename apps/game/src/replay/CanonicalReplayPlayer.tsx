/**
 * Canonical phone replay player: layered Repair Yard + F7 BotAssembler + event FX.
 * Outcome / XP never come from art — only from ConfirmedFightResult.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  AccessibilityInfo,
} from 'react-native';
import { BotAssembler } from '../assembler';
import {
  ENVIRONMENT_LAYER_Z,
  fitSceneToViewport,
  provisionalContactPoint,
  startPlacement,
} from '../arena';
import type { ActiveFxCue } from '../arena/EventFxLayer';
import { EventFxLayer } from '../arena/EventFxLayer';
import { RepairYardArena } from '../arena/RepairYardArena';
import { compileAnimationQueue, commandDuration, PlaybackController } from '../replay-playback';
import type { ConfirmedFightResult } from './confirmedResult';
import { formatOutcomeLine, resolvePlaybackMedia } from './confirmedResult';
import { loadoutFromFighter } from './fighterLoadout';
import {
  applyAnimationCommand,
  initialPresentationState,
  type ReplayPresentationState,
} from './playbackState';

export interface CanonicalReplayPlayerProps {
  readonly result: ConfirmedFightResult;
  readonly autoPlay?: boolean;
  readonly muted?: boolean;
  readonly onFinished?: () => void;
  readonly testID?: string;
}

export const CanonicalReplayPlayer: React.FC<CanonicalReplayPlayerProps> = ({
  result,
  autoPlay = true,
  muted = false,
  onFinished,
  testID = 'canonical-replay-player',
}) => {
  const placement = useMemo(() => startPlacement(), []);
  const [viewport, setViewport] = useState({ width: 360, height: 560 });
  const fit = useMemo(
    () => fitSceneToViewport(viewport.width, viewport.height),
    [viewport.height, viewport.width],
  );

  const nearFighter = result.replay.fighters[0];
  const farFighter = result.replay.fighters[1];
  const nearLoadout = useMemo(
    () => loadoutFromFighter(nearFighter, placement.near),
    [nearFighter, placement.near],
  );
  const farLoadout = useMemo(
    () => loadoutFromFighter(farFighter, placement.far),
    [farFighter, placement.far],
  );

  const maxHp = useMemo(
    () => ({ near: nearFighter.hp, far: farFighter.hp }),
    [farFighter.hp, nearFighter.hp],
  );

  const queue = useMemo(() => compileAnimationQueue(result.replay), [result.replay]);
  const media = useMemo(() => resolvePlaybackMedia(result), [result]);

  const [presentation, setPresentation] = useState<ReplayPresentationState>(() =>
    initialPresentationState(nearFighter.characterId, farFighter.characterId),
  );
  const [fxCues, setFxCues] = useState<ActiveFxCue[]>([]);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const playbackRef = useRef<PlaybackController | null>(null);
  const waitUntilRef = useRef(0);
  const cueSeqRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReducedMotion(Boolean(v));
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
      setReducedMotion(Boolean(v));
    });
    return () => {
      mounted = false;
      // RN web / older typings
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, []);

  const resetPlayback = useCallback(() => {
    playbackRef.current = new PlaybackController(queue);
    cueSeqRef.current = 0;
    waitUntilRef.current = 0;
    setPresentation(initialPresentationState(nearFighter.characterId, farFighter.characterId));
    setFxCues([]);
  }, [farFighter.characterId, nearFighter.characterId, queue]);

  useEffect(() => {
    resetPlayback();
    if (autoPlay) setPlaying(true);
  }, [autoPlay, resetPlayback, result.replay.checksum]);

  const contact = provisionalContactPoint(placement.near, placement.far);

  const pushFxFromState = useCallback(
    (state: ReplayPresentationState) => {
      const next: ActiveFxCue[] = state.activeFx.map((fx) => {
        if (fx.targetSlot === 'contact') {
          return { id: fx.cueKey, family: fx.family, x: contact.x, y: contact.y };
        }
        const actor = fx.targetSlot === 'near' ? placement.near : placement.far;
        const mirrorX = fx.family === 'dodge' && actor.facing === 'right';
        return {
          id: fx.cueKey,
          family: fx.family,
          x: actor.groundAnchor.x,
          y: actor.groundAnchor.y - 8,
          mirrorX,
        };
      });
      if (next.length > 0) {
        setFxCues((prev) => [...prev.filter((c) => next.every((n) => n.id !== c.id)), ...next]);
      }
    },
    [contact.x, contact.y, placement.far, placement.near],
  );

  useEffect(() => {
    if (!playing) return;

    const tick = (now: number) => {
      const pb = playbackRef.current;
      if (!pb || pb.finished) {
        setPlaying(false);
        onFinished?.();
        return;
      }
      if (now < waitUntilRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const cmd = pb.advance();
      if (!cmd) {
        setPlaying(false);
        onFinished?.();
        return;
      }
      cueSeqRef.current += 1;
      setPresentation((prev) => {
        const next = applyAnimationCommand(prev, cmd, cueSeqRef.current, maxHp);
        pushFxFromState(next);
        return next;
      });
      waitUntilRef.current = now + commandDuration(cmd);
      if (!pb.finished) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
        onFinished?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [maxHp, onFinished, playing, pushFxFromState]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
  };

  const sceneScale = fit.scale;

  return (
    <View testID={testID} style={styles.root} onLayout={onLayout}>
      <View style={styles.metaRow}>
        <Text style={styles.metaBadge} testID={`${testID}-source`}>
          {result.label === 'DEV' ? 'DEV recorded fixture' : 'Server confirmed'}
        </Text>
        <Text style={styles.metaMuted}>
          env {media.environmentVersion} · kit {media.kitVersion}
          {muted ? ' · muted' : ''}
          {reducedMotion ? ' · reduced-motion' : ''}
        </Text>
      </View>

      <View style={[styles.stageFrame, { width: fit.width, height: fit.height }]}>
        <RepairYardArena
          near={placement.near}
          far={placement.far}
          sceneScale={sceneScale}
          testID={`${testID}-arena`}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: placement.far.origin.x,
              top: placement.far.origin.y,
              width: placement.far.size,
              height: placement.far.size,
              overflow: 'hidden',
              zIndex: ENVIRONMENT_LAYER_Z.farActor,
            }}
          >
            <BotAssembler
              loadout={farLoadout}
              facing={placement.far.facing}
              size={placement.far.size}
              motionPose={presentation.far.motionPose}
              reducedMotion={reducedMotion}
              placeholder={false}
              testID={`${testID}-far`}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: placement.near.origin.x,
              top: placement.near.origin.y,
              width: placement.near.size,
              height: placement.near.size,
              overflow: 'hidden',
              zIndex: ENVIRONMENT_LAYER_Z.nearActor,
            }}
          >
            <BotAssembler
              loadout={nearLoadout}
              facing={placement.near.facing}
              size={placement.near.size}
              motionPose={presentation.near.motionPose}
              reducedMotion={reducedMotion}
              placeholder={false}
              testID={`${testID}-near`}
            />
          </View>
          <EventFxLayer cues={fxCues} reducedMotion={reducedMotion} />
          {presentation.banner ? (
            <Text style={styles.banner} testID={`${testID}-banner`}>
              {presentation.banner}
            </Text>
          ) : null}
        </RepairYardArena>
      </View>

      <View style={styles.hpRow}>
        <View style={styles.hpBlock}>
          <Text style={styles.hpLabel}>{nearFighter.displayName}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFillNear, { width: `${presentation.hp.near * 100}%` }]} />
          </View>
        </View>
        <View style={styles.hpBlock}>
          <Text style={styles.hpLabel}>{farFighter.displayName}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFillFar, { width: `${presentation.hp.far * 100}%` }]} />
          </View>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable
          testID={`${testID}-replay`}
          style={styles.btn}
          onPress={() => {
            resetPlayback();
            setPlaying(true);
          }}
        >
          <Text style={styles.btnText}>Replay same</Text>
        </Pressable>
        <Pressable
          testID={`${testID}-play`}
          style={[styles.btn, playing && styles.btnDisabled]}
          disabled={playing}
          onPress={() => setPlaying(true)}
        >
          <Text style={styles.btnText}>{playing ? 'Playing…' : 'Play'}</Text>
        </Pressable>
      </View>

      {presentation.showResult ? (
        <View style={styles.resultStrip} testID={`${testID}-inline-result`}>
          <Text style={styles.resultText}>{formatOutcomeLine(result.outcome)}</Text>
          <Text style={styles.metaMuted}>
            checksum {result.replayChecksum.slice(0, 12)}… · {queue.length} cmds
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1E2226',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  metaRow: {
    width: '100%',
    paddingVertical: 8,
    gap: 2,
  },
  metaBadge: {
    color: '#E3B23C',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  metaMuted: {
    color: '#9AA3AB',
    fontSize: 11,
  },
  stageFrame: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2A2E32',
  },
  banner: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#F3EADF',
    fontWeight: '800',
    fontSize: 18,
    zIndex: 90,
  },
  hpRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  hpBlock: {
    flex: 1,
    gap: 4,
  },
  hpLabel: {
    color: '#F3EADF',
    fontSize: 12,
    fontWeight: '700',
  },
  hpTrack: {
    height: 10,
    backgroundColor: '#3A4148',
    overflow: 'hidden',
  },
  hpFillNear: {
    height: '100%',
    backgroundColor: '#C45C26',
  },
  hpFillFar: {
    height: '100%',
    backgroundColor: '#3D6B8C',
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#E3B23C',
    borderWidth: 2,
    borderColor: '#2A2E32',
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  btnText: {
    fontWeight: '800',
    color: '#2A2E32',
    fontSize: 13,
  },
  resultStrip: {
    marginTop: 12,
    width: '100%',
    padding: 12,
    backgroundColor: '#2A2E32',
    gap: 4,
  },
  resultText: {
    color: '#F3EADF',
    fontWeight: '800',
    fontSize: 16,
  },
});
