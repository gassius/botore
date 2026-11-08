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
  oxide: '#C86A25',
  petrol: '#296D69',
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
