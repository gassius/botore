/**
 * Garage Tag candidate tokens from ui-kit-v0.1 (NOT newly approved hard tokens).
 * Source: botore-ui-kit-v0.1 tokens / build.py colour candidates.
 * Exact fonts, licences, and dimensions remain phone-proof proposals.
 */
export const garageTag = {
  cream: '#F4E4C8',
  paper: '#E2CFAD',
  graphite: '#302D27',
  mustard: '#F4B820',
  mustardPressed: '#D69812',
  steel: '#938A7C',
  /** Brand FINAL Oxide — matches A6 / kit paint_tokens.oxide. */
  oxide: '#E8771C',
  /** Kit Petrol sample token. */
  petrol: '#27877B',
  /** A6 v4 solids (token / chip colours). */
  primer: '#F4EFE0',
  ink: '#C8A4B0',
  drab: '#5A6438',
  cobalt: '#305070',
  frost: '#5C96C8',
  cinder: '#4A1C10',
  hazard: '#D89418',
  racing: '#F4EFE0',
  error: '#8C372C',
  white: '#FFF8E8',
  /** Candidate geometry — preserve proportions; do not stretch-to-fill. */
  outline: 3,
  cutCorner: 10,
  rivetRadius: 4,
  /** Kit recommendation: 48dp preferred, 44dp platform floor. */
  touchMin: 48,
  touchFloor: 44,
  bodySp: 16,
  kitVersion: '0.1.0',
  kitStatus: 'candidate' as const,
} as const;

export type GarageTagTokens = typeof garageTag;
