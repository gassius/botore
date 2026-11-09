/**
 * Hit / dodge / defeat FX frames. Spawn only from authoritative replay events.
 * Frame progression is PROVISIONAL — not final timing acceptance.
 * Reduced motion: one restrained static accent (middle frame) or skip tween.
 *
 * Each cue is a direct arena sibling with its family zIndex (dodge 45 / defeat 55 /
 * hit 80). Do not wrap all cues under an unranked parent — native zIndex is
 * sibling-scoped and would leave FX behind the opaque floor.
 *
 * When `paused` (playback hold / capture still), freeze on the peak mid-frame and
 * do not auto-hide — otherwise the ~270ms sprite strip finishes before CI can
 * screencap the 8s FX hold and stills show pose-only / idle frames.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { ENVIRONMENT_FX_META } from './environmentAssets';
import { ENVIRONMENT_FX_SOURCES } from './environmentMetroAssets';
import { FX_FAMILY_Z, fxPeakFrameIndex, type ArenaFxFamily } from './environmentPin';

export type FxFamily = ArenaFxFamily;

export interface ActiveFxCue {
  readonly id: string;
  readonly family: FxFamily;
  /** Scene-space pivot placement. */
  readonly x: number;
  readonly y: number;
  /** Mirror dodge dust local X when motion is rightward. */
  readonly mirrorX?: boolean;
}

export interface EventFxLayerProps {
  readonly cues: readonly ActiveFxCue[];
  readonly reducedMotion?: boolean;
  /** PROVISIONAL per-frame ms — not approved timing. */
  readonly frameMs?: number;
  /**
   * Playback is paused (incl. C4 FX capture hold). Freeze a visible mid-frame
   * and keep the sprite on screen until unpaused.
   */
  readonly paused?: boolean;
}

export {
  FX_FAMILY_Z,
  fxCueSiblingZ,
  fxPeakFrameIndex,
  fxRendersAboveFloor,
} from './environmentPin';

function FxSprite({
  cue,
  reducedMotion,
  frameMs,
  paused,
}: {
  cue: ActiveFxCue;
  reducedMotion: boolean;
  frameMs: number;
  paused: boolean;
}): React.ReactElement | null {
  const frames = ENVIRONMENT_FX_SOURCES[cue.family];
  const meta = ENVIRONMENT_FX_META[cue.family];
  const peak = fxPeakFrameIndex(frames.length);
  const [frameIndex, setFrameIndex] = useState(reducedMotion || paused ? peak : 0);
  const [visible, setVisible] = useState(true);
  const frozeDuringCueRef = useRef(false);
  /** Strip already finished — must not re-show when a later capture hold pauses playback. */
  const completedRef = useRef(false);

  useEffect(() => {
    if (paused) {
      if (completedRef.current) return;
      frozeDuringCueRef.current = true;
      setVisible(true);
      setFrameIndex(peak);
      return;
    }
    if (frozeDuringCueRef.current) {
      // Capture hold / user pause ended — dismiss rather than replaying the strip.
      frozeDuringCueRef.current = false;
      completedRef.current = true;
      setVisible(false);
      return;
    }
    setVisible(true);
    if (reducedMotion) {
      setFrameIndex(peak);
      const hide = setTimeout(() => {
        completedRef.current = true;
        setVisible(false);
      }, frameMs * 2);
      return () => clearTimeout(hide);
    }
    setFrameIndex(0);
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      if (i >= frames.length) {
        clearInterval(tick);
        completedRef.current = true;
        setVisible(false);
        return;
      }
      setFrameIndex(i);
    }, frameMs);
    return () => clearInterval(tick);
  }, [cue.id, frames.length, frameMs, reducedMotion, paused, peak]);

  if (!visible) return null;

  const source = frames[frameIndex] ?? frames[0];
  if (!source) return null;

  return (
    <View
      pointerEvents="none"
      testID={`fx-${cue.family}-${cue.id}`}
      style={{
        position: 'absolute',
        left: cue.x,
        top: cue.y,
        width: 0,
        height: 0,
        zIndex: FX_FAMILY_Z[cue.family],
      }}
    >
      <Image
        source={source}
        style={{
          position: 'absolute',
          left: -meta.pivot[0],
          top: -meta.pivot[1],
          width: meta.width,
          height: meta.height,
          transform: cue.mirrorX ? [{ scaleX: -1 }] : undefined,
        }}
      />
    </View>
  );
}

export const EventFxLayer: React.FC<EventFxLayerProps> = ({
  cues,
  reducedMotion = false,
  frameMs = 90,
  paused = false,
}) => {
  // Fragment: each cue View is a direct sibling of floor/actors under the arena.
  return (
    <>
      {cues.map((cue) => (
        <FxSprite
          key={cue.id}
          cue={cue}
          reducedMotion={reducedMotion}
          frameMs={frameMs}
          paused={paused}
        />
      ))}
    </>
  );
};
