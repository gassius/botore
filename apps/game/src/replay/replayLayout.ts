/**
 * Replay player layout helpers — reserve chrome before fitting the arena stage
 * so HP / controls / result are not clipped by overflow:hidden parents.
 */

export type ReplayChromeHeights = {
  readonly meta: number;
  readonly hp: number;
  readonly controls: number;
  readonly result: number;
  readonly verticalPadding: number;
};

export const DEFAULT_REPLAY_CHROME: ReplayChromeHeights = {
  meta: 40,
  hp: 36,
  controls: 52,
  result: 64,
  verticalPadding: 12,
};

export function reservedReplayChromeHeight(
  chrome: ReplayChromeHeights,
  opts: { readonly showResult: boolean },
): number {
  return (
    chrome.meta +
    chrome.hp +
    chrome.controls +
    (opts.showResult ? chrome.result : 0) +
    chrome.verticalPadding
  );
}

/** Stage viewport after reserving non-shrinking chrome siblings. */
export function stageViewportFromPlayer(
  playerWidth: number,
  playerHeight: number,
  reservedHeight: number,
): { readonly width: number; readonly height: number } {
  const width = Math.max(0, playerWidth);
  const height = Math.max(0, playerHeight - reservedHeight);
  return { width, height };
}

/** True when stage + chrome fit inside the allotted player box. */
export function replayContentFits(
  playerWidth: number,
  playerHeight: number,
  chrome: ReplayChromeHeights,
  opts: { readonly showResult: boolean; readonly minStageHeight?: number },
): boolean {
  const reserved = reservedReplayChromeHeight(chrome, opts);
  const stage = stageViewportFromPlayer(playerWidth, playerHeight, reserved);
  const minStage = opts.minStageHeight ?? 48;
  return stage.width >= 48 && stage.height >= minStage && reserved + stage.height <= playerHeight;
}
