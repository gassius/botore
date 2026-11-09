/**
 * Ranking scroll contract (PRR blocker on #16).
 *
 * RankingScreen must use ScreenChrome's default scrolling body (`scroll` true)
 * so long fixture lists, wrap-heavy names, and refresh-error banners remain
 * reachable on short viewports / larger font scales. Do not set scroll={false}.
 */
export const RANKING_SCREEN_CHROME_SCROLL = true as const;

/** Short phone body estimate used by regression evidence (not a locked token). */
export const RANKING_SHORT_VIEWPORT_HEIGHT = 480;

/** Matches Garage Tag touchMin row floor used in RankingScreen styles. */
export const RANKING_ROW_MIN_HEIGHT = 48;

export function rankingContentExceedsShortViewport(
  rowCount: number,
  options?: { viewportHeight?: number; rowMinHeight?: number },
): boolean {
  const viewportHeight = options?.viewportHeight ?? RANKING_SHORT_VIEWPORT_HEIGHT;
  const rowMinHeight = options?.rowMinHeight ?? RANKING_ROW_MIN_HEIGHT;
  return rowCount * rowMinHeight > viewportHeight;
}
