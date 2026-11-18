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
 * Content-sized bottom band height (call-out plate + arena tag + pads).
 * The band hugs the bottom; the arena takes the remainder (≥ ~75% on 390×844).
 */
export const FIGHT_VIEW_BAND_CONTENT_HEIGHT = 148;

export const FIGHT_VIEW_ARENA_NAME = 'Repair Yard';

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
