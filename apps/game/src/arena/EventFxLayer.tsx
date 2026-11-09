/**
 * Hit / dodge / defeat FX frames. Spawn only from authoritative replay events.
 * Frame progression is PROVISIONAL — not final timing acceptance.
 * Reduced motion: one restrained static accent (middle frame) or skip tween.
 *
 * Each cue is a direct arena sibling with its family zIndex (dodge 45 / defeat 55 /
 * hit 80). Do not wrap all cues under an unranked parent — native zIndex is
 * sibling-scoped and would leave FX behind the opaque floor.
 */
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { ENVIRONMENT_FX_META } from './environmentAssets';
import { ENVIRONMENT_FX_SOURCES } from './environmentMetroAssets';
import { FX_FAMILY_Z, type ArenaFxFamily } from './environmentPin';

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
}

export { FX_FAMILY_Z, fxCueSiblingZ, fxRendersAboveFloor } from './environmentPin';

function FxSprite({
  cue,
  reducedMotion,
  frameMs,
}: {
  cue: ActiveFxCue;
  reducedMotion: boolean;
  frameMs: number;
}): React.ReactElement | null {
  const frames = ENVIRONMENT_FX_SOURCES[cue.family];
  const meta = ENVIRONMENT_FX_META[cue.family];
  const [frameIndex, setFrameIndex] = useState(reducedMotion ? 1 : 0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (reducedMotion) {
      setFrameIndex(1);
      const hide = setTimeout(() => setVisible(false), frameMs * 2);
      return () => clearTimeout(hide);
    }
    setFrameIndex(0);
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      if (i >= frames.length) {
        clearInterval(tick);
        setVisible(false);
        return;
      }
      setFrameIndex(i);
    }, frameMs);
    return () => clearInterval(tick);
  }, [cue.id, frames.length, frameMs, reducedMotion]);

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
}) => {
  // Fragment: each cue View is a direct sibling of floor/actors under the arena.
  return (
    <>
      {cues.map((cue) => (
        <FxSprite key={cue.id} cue={cue} reducedMotion={reducedMotion} frameMs={frameMs} />
      ))}
    </>
  );
};
