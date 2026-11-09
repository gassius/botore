/**
 * ScreenChrome flex-chain contract (PRR P1).
 * ScrollView needs a bounded parent height; GaragePanel's content wrapper must
 * participate when used as the screen frame (`fill`), without forcing all panels to stretch.
 */
export type ScreenChromeLayoutOptions = {
  /** Carry flex:1 through GaragePanel panel + inner (ScreenChrome only). */
  fillInner: boolean;
  viewportHeight: number;
  safePadding: number;
  panelBorder: number;
  innerPadding: number;
  footerHeight: number;
  contentHeight: number;
  scrollMode: boolean;
};

export type ScreenChromeLayoutResult = {
  frameHeight: number;
  innerHeight: number;
  /** Scroll/body viewport height after footer; 0 indicates the broken chain. */
  scrollViewportHeight: number;
  footerRetained: boolean;
};

/**
 * Simplified column flex model matching the ScreenChrome tree:
 * safe(flex1, padding) → panel(flex1, border) → inner(?flex1, padding) → [scroll(flex1) | body(flex1)] + footer(fixed).
 * Used for regression evidence; not a full Yoga substitute.
 */
export function measureScreenChromeLayout(
  options: ScreenChromeLayoutOptions,
): ScreenChromeLayoutResult {
  const {
    fillInner,
    viewportHeight,
    safePadding,
    panelBorder,
    innerPadding,
    footerHeight,
    scrollMode,
  } = options;

  const frameHeight = Math.max(0, viewportHeight - safePadding * 2);
  const panelContentHeight = Math.max(0, frameHeight - panelBorder * 2);

  // Without fillInner: inner shrink-wraps to padding + non-flex footer;
  // flex:1 ScrollView (content does not contribute to flex size) → 0 height.
  // Matches Yoga 3.2.1: frame 824, inner 152, scroll 0 with footer 120.
  if (!fillInner) {
    const innerHeight = innerPadding * 2 + footerHeight;
    return {
      frameHeight,
      innerHeight,
      scrollViewportHeight: 0,
      footerRetained: footerHeight > 0,
    };
  }

  const innerHeight = panelContentHeight;
  const innerContentHeight = Math.max(0, innerHeight - innerPadding * 2);
  const scrollViewportHeight = Math.max(0, innerContentHeight - footerHeight);
  void scrollMode; // body vs scroll both need the same bounded flex parent

  return {
    frameHeight,
    innerHeight,
    scrollViewportHeight,
    footerRetained: footerHeight > 0 && scrollViewportHeight > 0,
  };
}
