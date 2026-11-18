/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from 'react-native';
import { resolveA6OpponentPanelSlug } from './a6OpponentPanelResolve';

/**
 * A6 D8 opponent panel art (ClickUp 1amjtreze87) — mirrored idle, 170×169.
 * Resolve from loadout (paint + weapon), then display name; never character id.
 */
const OPPONENT_PANELS: Record<string, ImageSourcePropType> = {
  'boiler-joe': require('../../../assets/a6-opponents/boiler-joe.png'),
  'can-hook': require('../../../assets/a6-opponents/can-hook.png'),
  'cinder-cal': require('../../../assets/a6-opponents/cinder-cal.png'),
  'cobalt-brute': require('../../../assets/a6-opponents/cobalt-brute.png'),
  'drab-hank': require('../../../assets/a6-opponents/drab-hank.png'),
  'frost-kit': require('../../../assets/a6-opponents/frost-kit.png'),
  'ink-pip': require('../../../assets/a6-opponents/ink-pip.png'),
  'petrol-gus': require('../../../assets/a6-opponents/petrol-gus.png'),
  'primer-peg': require('../../../assets/a6-opponents/primer-peg.png'),
  'rivet-nan': require('../../../assets/a6-opponents/rivet-nan.png'),
  'slab-mick': require('../../../assets/a6-opponents/slab-mick.png'),
  'weld-tess': require('../../../assets/a6-opponents/weld-tess.png'),
};

export function resolveA6OpponentPanel(input: {
  displayName?: string | null;
  paintId?: string | null;
  weaponId?: string | null;
}): ImageSourcePropType | null {
  const slug = resolveA6OpponentPanelSlug(input);
  if (slug && OPPONENT_PANELS[slug]) return OPPONENT_PANELS[slug];
  return null;
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
