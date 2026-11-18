/**
 * D1 Fight View — first-watch vs rewatch control sets.
 * Never reveal on first viewing that the fight is an already-decided replay.
 */

export type FightViewMode = 'firstWatch' | 'rewatch';

/** Bottom-band event plate; never carries IDs / checksums / server-debug text. */
export type FightViewCallout = {
  readonly headline: string;
  readonly detail: string;
};

/** Hold after KO before showing the D2 Result overlay on the dimmed arena. */
export const FIGHT_VIEW_KO_HOLD_MS = 1000;

/** Arena share of a 390×844 phone viewport (acceptance ≥ 72%). */
export const FIGHT_VIEW_ARENA_HEIGHT_RATIO = 0.75;

/**
 * HUD chrome height below the safe-area inset (pads + name + owner + HP).
 * Rewatch Back sits just under this strip so it never covers near-side name/HP.
 */
export const FIGHT_VIEW_HUD_BELOW_INSET = 97;

/**
 * Fixed bottom band height (96 px call-out plate + pads). Must stay constant
 * empty or filled so the arena never jumps (D10 / E2).
 */
export const FIGHT_VIEW_BAND_CONTENT_HEIGHT = 148;

/** Fixed call-out plate height inside the band (D10). */
export const FIGHT_VIEW_CALLOUT_PLATE_HEIGHT = 96;

/** Arena place name — shown as an in-arena location tag, not a bottom pill (D10). */
export const FIGHT_VIEW_ARENA_NAME = 'Repair Yard';

/** Player-facing location label: `ARENA · REPAIR YARD`. */
export function formatArenaLocationLabel(arenaName: string = FIGHT_VIEW_ARENA_NAME): string {
  return `ARENA · ${arenaName.trim().toUpperCase()}`;
}

/** Pure shell split for layout asserts (phone 390×844). */
export function fightViewShellHeights(
  viewportHeight: number,
  bandHeight: number = FIGHT_VIEW_BAND_CONTENT_HEIGHT,
): { readonly arenaHeight: number; readonly bandHeight: number; readonly arenaRatio: number } {
  const arenaHeight = Math.max(0, viewportHeight - bandHeight);
  return {
    arenaHeight,
    bandHeight,
    arenaRatio: viewportHeight > 0 ? arenaHeight / viewportHeight : 0,
  };
}
