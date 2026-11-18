/* eslint-disable @typescript-eslint/no-require-imports */
import type { ImageSourcePropType } from 'react-native';

/**
 * A6 D8 opponent panel art (ClickUp 1amjtreze87) — mirrored idle, 170×169.
 * Map known character / display names onto NPC slugs; otherwise fall back to
 * live BotAssembler in the card stage.
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

const NAME_TO_SLUG: Record<string, string> = {
  'boiler joe': 'boiler-joe',
  'can hook': 'can-hook',
  'cinder cal': 'cinder-cal',
  'cobalt brute': 'cobalt-brute',
  'drab hank': 'drab-hank',
  'frost kit': 'frost-kit',
  'ink pip': 'ink-pip',
  'petrol gus': 'petrol-gus',
  'primer peg': 'primer-peg',
  'rivet nan': 'rivet-nan',
  'slab mick': 'slab-mick',
  'weld tess': 'weld-tess',
};

/** Stable seed character ids → A6 panel slugs (D8). */
const CHARACTER_ID_TO_SLUG: Record<string, string> = {
  'opp-dex-bot': 'can-hook',
  'opp-hp-bot': 'cobalt-brute',
  'opp-sir-bot': 'slab-mick',
};

export function resolveA6OpponentPanel(input: {
  characterId?: string | null;
  displayName?: string | null;
}): ImageSourcePropType | null {
  const characterId = (input.characterId ?? '').trim().toLowerCase();
  const fromId = CHARACTER_ID_TO_SLUG[characterId];
  if (fromId && OPPONENT_PANELS[fromId]) return OPPONENT_PANELS[fromId];

  const bare = characterId.replace(/^opp-/, '');
  if (bare && OPPONENT_PANELS[bare]) return OPPONENT_PANELS[bare];

  const name = (input.displayName ?? '').trim().toLowerCase();
  const slug = NAME_TO_SLUG[name];
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
