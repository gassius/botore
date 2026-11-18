import type { ImageSourcePropType } from 'react-native';
import { resolveOpponentPresentation } from '../../garage-tag/a6OpponentPresentation';

import boilerJoe from '../../../assets/a6-opponents/boiler-joe.png';
import canHook from '../../../assets/a6-opponents/can-hook.png';
import cinderCal from '../../../assets/a6-opponents/cinder-cal.png';
import cobaltBrute from '../../../assets/a6-opponents/cobalt-brute.png';
import drabHank from '../../../assets/a6-opponents/drab-hank.png';
import frostKit from '../../../assets/a6-opponents/frost-kit.png';
import inkPip from '../../../assets/a6-opponents/ink-pip.png';
import petrolGus from '../../../assets/a6-opponents/petrol-gus.png';
import primerPeg from '../../../assets/a6-opponents/primer-peg.png';
import rivetNan from '../../../assets/a6-opponents/rivet-nan.png';
import slabMick from '../../../assets/a6-opponents/slab-mick.png';
import weldTess from '../../../assets/a6-opponents/weld-tess.png';

/**
 * A6 D8 opponent panel art (ClickUp 1amjtreze87) — mirrored idle, 170×169.
 * Art source is shared with Confirm Fight via resolveOpponentPresentation.
 * ESM imports so Vitest/Vite can resolve PNG assets.
 */
const OPPONENT_PANELS: Record<string, ImageSourcePropType> = {
  'boiler-joe': boilerJoe,
  'can-hook': canHook,
  'cinder-cal': cinderCal,
  'cobalt-brute': cobaltBrute,
  'drab-hank': drabHank,
  'frost-kit': frostKit,
  'ink-pip': inkPip,
  'petrol-gus': petrolGus,
  'primer-peg': primerPeg,
  'rivet-nan': rivetNan,
  'slab-mick': slabMick,
  'weld-tess': weldTess,
};

export function resolveA6OpponentPanel(input: {
  characterId?: string | null;
  displayName?: string | null;
  paintId?: string | null;
  weaponId?: string | null;
}): ImageSourcePropType | null {
  const presentation = resolveOpponentPresentation({
    characterId: input.characterId ?? '',
    displayName: input.displayName ?? '',
    paintId: input.paintId ?? '',
    weaponId: input.weaponId ?? '',
  });
  if (!presentation.usePanelArt || !presentation.npcId) return null;
  return OPPONENT_PANELS[presentation.npcId] ?? null;
}

/** D8 card / snap geometry from A6 SCREENS-SPEC. */
export const A6_OPPONENTS = {
  cardHeight: 175,
  cardGap: 10,
  snapInterval: 185,
  stageWidth: 170,
  stageHeight: 169,
  robotBody: 150,
} as const;
