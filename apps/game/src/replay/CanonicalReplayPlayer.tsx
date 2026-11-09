/**
 * Canonical phone replay player: layered Repair Yard + F7 BotAssembler + event FX.
 * Outcome / XP never come from art — only from ConfirmedFightResult.
 * Shell owns Garage Tag chrome; this player drives stage + optional local controls.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
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
import { garageTag } from '../garage-tag';
import { compileAnimationQueue, commandDuration, PlaybackController } from '../replay-playback';
import type { ConfirmedFightResult } from './confirmedResult';
import { formatOutcomeLine, resolvePlaybackMedia } from './confirmedResult';
import { assemblerLoadoutFromBuild } from './fighterLoadout';
import {
  applyAnimationCommand,
  initialPresentationState,
  type ReplayPresentationState,
} from './playbackState';
import {
  initialPlaybackUi,
  pauseState,
  playbackUiAfterAdvance,
  progressFromPosition,
  restartState,
  resumeState,
  togglePlayState,
  type PlaybackUiState,
} from './playbackControl';
import { DEFAULT_REPLAY_CHROME, reservedReplayChromeHeight } from './replayLayout';

export interface CanonicalReplayPlayerProps {
  readonly result: ConfirmedFightResult;
  readonly autoPlay?: boolean;
  readonly muted?: boolean;
  /** Effective reduced-motion preference from shell (force ∪ OS). */
  readonly reducedMotion?: boolean;
  /** When false, hide local Play/Replay buttons (shell ReplayAudioControls owns them). */
  readonly showLocalControls?: boolean;
  readonly onFinished?: () => void;
  readonly onPlaybackChange?: (state: PlaybackUiState) => void;
  readonly testID?: string;
}

export type CanonicalReplayPlayerHandle = {
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  replay: () => void;
  getPlaybackState: () => PlaybackUiState;
};

export const CanonicalReplayPlayer = forwardRef<
  CanonicalReplayPlayerHandle,
  CanonicalReplayPlayerProps
>(function CanonicalReplayPlayer(
  {
    result,
    autoPlay = true,
    muted = false,
    reducedMotion: reducedMotionProp,
    showLocalControls = true,
    onFinished,
    onPlaybackChange,
    testID = 'canonical-replay-player',
  },
  ref,
) {
  const placement = useMemo(() => startPlacement(), []);
  const [stageBox, setStageBox] = useState({ width: 360, height: 320 });
  const fit = useMemo(
    () => fitSceneToViewport(stageBox.width, Math.max(stageBox.height, 1)),
    [stageBox.height, stageBox.width],
  );

  const nearFighter = result.replay.fighters[0];
  const farFighter = result.replay.fighters[1];
  // Stored sealed builds drive assembler — never scene paintAlias.
  const nearLoadout = useMemo(
    () => assemblerLoadoutFromBuild(result.builds.attacker),
    [result.builds.attacker],
  );
  const farLoadout = useMemo(
    () => assemblerLoadoutFromBuild(result.builds.defender),
    [result.builds.defender],
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
  const [playbackUi, setPlaybackUi] = useState<PlaybackUiState>(() =>
    initialPlaybackUi(queue.length),
  );
  const [osReducedMotion, setOsReducedMotion] = useState(false);
  const playbackRef = useRef<PlaybackController | null>(null);
  const waitUntilRef = useRef(0);
  const cueSeqRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const playbackUiRef = useRef(playbackUi);
  playbackUiRef.current = playbackUi;

  const reducedMotion = reducedMotionProp ?? osReducedMotion;

  const emitPlayback = useCallback(
    (next: PlaybackUiState) => {
      setPlaybackUi(next);
      onPlaybackChange?.(next);
    },
    [onPlaybackChange],
  );

  useEffect(() => {
    if (reducedMotionProp !== undefined) return;
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setOsReducedMotion(Boolean(v));
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
      setOsReducedMotion(Boolean(v));
    });
    return () => {
      mounted = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any)?.remove?.();
    };
  }, [reducedMotionProp]);

  const resetPlayback = useCallback(
    (startPlaying: boolean) => {
      playbackRef.current = new PlaybackController(queue);
      cueSeqRef.current = 0;
      waitUntilRef.current = 0;
      setPresentation(initialPresentationState(nearFighter.characterId, farFighter.characterId));
      setFxCues([]);
      const next = startPlaying ? restartState(queue.length) : initialPlaybackUi(queue.length);
      emitPlayback(next);
    },
    [emitPlayback, farFighter.characterId, nearFighter.characterId, queue],
  );

  useEffect(() => {
    resetPlayback(autoPlay);
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
    if (!playbackUi.playing || !media.assetsAvailable) return;

    const tick = (now: number) => {
      const pb = playbackRef.current;
      if (!pb || pb.finished) {
        emitPlayback(
          playbackUiAfterAdvance(
            { ...playbackUiRef.current, playing: false },
            pb?.total ?? playbackUiRef.current.totalCommands,
          ),
        );
        onFinished?.();
        return;
      }
      if (now < waitUntilRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const cmd = pb.advance();
      if (!cmd) {
        emitPlayback(
          playbackUiAfterAdvance({ ...playbackUiRef.current, playing: false }, pb.total),
        );
        onFinished?.();
        return;
      }
      cueSeqRef.current += 1;
      setPresentation((prev) => {
        const next = applyAnimationCommand(prev, cmd, cueSeqRef.current, maxHp);
        pushFxFromState(next);
        return next;
      });
      emitPlayback(playbackUiAfterAdvance(playbackUiRef.current, pb.position));
      waitUntilRef.current = now + commandDuration(cmd);
      if (!pb.finished) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        emitPlayback(
          playbackUiAfterAdvance({ ...playbackUiRef.current, playing: false }, pb.total),
        );
        onFinished?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [emitPlayback, maxHp, media.assetsAvailable, onFinished, playbackUi.playing, pushFxFromState]);

  useImperativeHandle(
    ref,
    () => ({
      togglePlay: () => {
        const cur = playbackUiRef.current;
        if (cur.commandIndex >= cur.totalCommands) {
          resetPlayback(true);
          return;
        }
        emitPlayback(togglePlayState(cur));
      },
      play: () => emitPlayback(resumeState(playbackUiRef.current)),
      pause: () => emitPlayback(pauseState(playbackUiRef.current)),
      replay: () => resetPlayback(true),
      getPlaybackState: () => playbackUiRef.current,
    }),
    [emitPlayback, resetPlayback],
  );

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setStageBox({ width, height });
  };

  const sceneScale = fit.scale;
  const playing = playbackUi.playing;

  if (!media.assetsAvailable) {
    return (
      <View testID={testID} style={styles.root}>
        <View style={styles.unavailable} testID={`${testID}-media-unavailable`}>
          <Text style={styles.unavailableTitle}>Historical media unavailable</Text>
          <Text style={styles.unavailableBody}>{media.unavailableReason}</Text>
          <Text style={styles.metaMuted}>
            Stored env {media.environmentVersion} · kit {media.kitVersion} — not substituted with
            active pack.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.root}>
      <View style={styles.metaRow} onLayout={() => undefined} testID={`${testID}-meta`}>
        <Text style={styles.metaBadge} testID={`${testID}-source`}>
          {result.label === 'DEV' ? 'DEV recorded fixture' : 'Server confirmed'}
        </Text>
        <Text style={styles.metaMuted} testID={`${testID}-media`}>
          env {media.environmentVersion} · kit {media.kitVersion}
          {media.usesStoredVersions ? ' · stored refs' : ''}
          {muted ? ' · muted' : ''}
          {reducedMotion ? ' · reduced-motion' : ''}
        </Text>
        <Text style={styles.metaMuted} testID={`${testID}-builds`}>
          A {nearLoadout.paint}/{nearLoadout.weapon} · D {farLoadout.paint}/{farLoadout.weapon}
        </Text>
      </View>

      {/* Flexible stage viewport — measured after chrome reservation via flex. */}
      <View style={styles.stageSlot} onLayout={onStageLayout} testID={`${testID}-stage-slot`}>
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
      </View>

      <View style={styles.hpRow} testID={`${testID}-hp`}>
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

      {showLocalControls ? (
        <View style={styles.controls} testID={`${testID}-controls`}>
          <Pressable
            testID={`${testID}-replay`}
            style={styles.btn}
            onPress={() => resetPlayback(true)}
          >
            <Text style={styles.btnText}>Replay same</Text>
          </Pressable>
          <Pressable
            testID={`${testID}-play`}
            style={styles.btn}
            onPress={() => {
              const cur = playbackUiRef.current;
              if (cur.commandIndex >= cur.totalCommands) {
                resetPlayback(true);
                return;
              }
              emitPlayback(togglePlayState(cur));
            }}
          >
            <Text style={styles.btnText}>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
        </View>
      ) : (
        <View
          style={styles.progressOnly}
          testID={`${testID}-progress`}
          accessibilityValue={{
            now: Math.round(playbackUi.progress * 100),
            min: 0,
            max: 100,
          }}
        >
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${playbackUi.progress * 100}%` }]} />
          </View>
        </View>
      )}

      {presentation.showResult ? (
        <View style={styles.resultStrip} testID={`${testID}-inline-result`}>
          <Text style={styles.resultText}>{formatOutcomeLine(result.outcome)}</Text>
          <Text style={styles.metaMuted}>
            checksum {result.replayChecksum.slice(0, 12)}… · {queue.length} cmds ·{' '}
            {Math.round(progressFromPosition(playbackUi.commandIndex, queue.length) * 100)}%
          </Text>
        </View>
      ) : null}
    </View>
  );
});

/** Exported for layout tests — reserved chrome for a typical player composition. */
export function canonicalReplayReservedHeight(showResult: boolean): number {
  return reservedReplayChromeHeight(DEFAULT_REPLAY_CHROME, { showResult });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: garageTag.graphite,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    minHeight: 0,
  },
  metaRow: {
    width: '100%',
    paddingVertical: 6,
    gap: 2,
    flexShrink: 0,
  },
  metaBadge: {
    color: garageTag.mustard,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  metaMuted: {
    color: garageTag.steel,
    fontSize: 11,
  },
  stageSlot: {
    flex: 1,
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageFrame: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: garageTag.graphite,
  },
  banner: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: garageTag.cream,
    fontWeight: '800',
    fontSize: 18,
    zIndex: 90,
  },
  hpRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    flexShrink: 0,
  },
  hpBlock: {
    flex: 1,
    gap: 4,
  },
  hpLabel: {
    color: garageTag.cream,
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
    backgroundColor: garageTag.oxide,
  },
  hpFillFar: {
    height: '100%',
    backgroundColor: garageTag.petrol,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    width: '100%',
    flexShrink: 0,
  },
  progressOnly: {
    width: '100%',
    marginTop: 8,
    flexShrink: 0,
    height: 12,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#3A4148',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: garageTag.mustard,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: garageTag.mustard,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    alignItems: 'center',
  },
  btnText: {
    fontWeight: '800',
    color: garageTag.graphite,
    fontSize: 13,
  },
  resultStrip: {
    marginTop: 8,
    width: '100%',
    padding: 10,
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    gap: 4,
    flexShrink: 0,
  },
  resultText: {
    color: garageTag.graphite,
    fontWeight: '800',
    fontSize: 16,
  },
  unavailable: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
    backgroundColor: garageTag.paper,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
  },
  unavailableTitle: {
    color: garageTag.error,
    fontWeight: '900',
    fontSize: 16,
  },
  unavailableBody: {
    color: garageTag.graphite,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
  },
});
