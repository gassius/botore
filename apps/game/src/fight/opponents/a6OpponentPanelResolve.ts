import { paintUiAlias, weaponUiAlias } from '../../garage/loadout/proofCatalogue';

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

/** Seed / A6 loadout combos → panel slug (paint+weapon, not character id). */
const LOADOUT_TO_SLUG: Record<string, string> = {
  'oxide|dagger': 'can-hook',
  'petrol|axe': 'cobalt-brute',
  'petrol|sword': 'slab-mick',
};

/** Resolve A6 opponent panel slug from loadout first, then display name. */
export function resolveA6OpponentPanelSlug(input: {
  displayName?: string | null;
  paintId?: string | null;
  weaponId?: string | null;
}): string | null {
  if (input.paintId && input.weaponId) {
    const key = `${paintUiAlias(input.paintId)}|${weaponUiAlias(input.weaponId)}`;
    const fromLoadout = LOADOUT_TO_SLUG[key];
    if (fromLoadout) return fromLoadout;
  }

  const name = (input.displayName ?? '').trim().toLowerCase();
  return NAME_TO_SLUG[name] ?? null;
}
