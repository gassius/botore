import { describe, expect, it } from 'vitest';
import { measureScreenChromeLayout } from '../src/garage-tag/screenChromeLayout';

type YogaEnums = {
  FlexDirection: { Column: number };
  Direction: { LTR: number };
  Edge: { All: number };
};

type YogaNode = {
  setWidth: (n: number) => void;
  setHeight: (n: number) => void;
  setFlexDirection: (n: number) => void;
  setPadding: (edge: number, n: number) => void;
  setBorder: (edge: number, n: number) => void;
  setFlexGrow: (n: number) => void;
  setFlexShrink: (n: number) => void;
  insertChild: (child: YogaNode, index: number) => void;
  calculateLayout: (w: number, h: number, direction: number) => void;
  getComputedHeight: () => number;
  freeRecursive: () => void;
};

type YogaRuntime = {
  Node: { create: () => YogaNode };
};

/**
 * PRR P1 regression: ScreenChrome → GaragePanel inner must pass a bounded
 * height to flex:1 ScrollView. Yoga 3.2.1 tree mirrors the reviewer's repro
 * (390×844, 10dp safe pad, 3dp border, 16dp inner pad, 120dp footer).
 * Scroll content does not contribute to ScrollView flex sizing.
 */
async function yogaScreenChrome(fillInner: boolean) {
  const mod = (await import('yoga-layout/load')) as YogaEnums & {
    loadYoga: () => Promise<YogaRuntime>;
  };
  const { loadYoga, FlexDirection, Direction, Edge } = mod;
  const Yoga = await loadYoga();
  const W = 390;
  const H = 844;
  const safePad = 10;
  const border = 3;
  const innerPad = 16;
  const footer = 120;

  const root = Yoga.Node.create();
  root.setWidth(W);
  root.setHeight(H);
  root.setFlexDirection(FlexDirection.Column);
  root.setPadding(Edge.All, safePad);

  const panel = Yoga.Node.create();
  panel.setFlexGrow(1);
  panel.setFlexShrink(1);
  panel.setBorder(Edge.All, border);
  panel.setFlexDirection(FlexDirection.Column);
  root.insertChild(panel, 0);

  const inner = Yoga.Node.create();
  if (fillInner) {
    inner.setFlexGrow(1);
    inner.setFlexShrink(1);
  }
  inner.setPadding(Edge.All, innerPad);
  inner.setFlexDirection(FlexDirection.Column);
  panel.insertChild(inner, 0);

  const scroll = Yoga.Node.create();
  scroll.setFlexGrow(1);
  scroll.setFlexShrink(1);
  inner.insertChild(scroll, 0);

  const foot = Yoga.Node.create();
  foot.setHeight(footer);
  foot.setFlexShrink(0);
  inner.insertChild(foot, 1);

  root.calculateLayout(W, H, Direction.LTR);
  const result = {
    frame: panel.getComputedHeight(),
    inner: inner.getComputedHeight(),
    scroll: scroll.getComputedHeight(),
    footer: foot.getComputedHeight(),
  };
  root.freeRecursive();
  return result;
}

describe('ScreenChrome flex height chain (PRR P1)', () => {
  it('Yoga: without fillInner, scroll viewport collapses to 0 (reviewer repro)', async () => {
    const broken = await yogaScreenChrome(false);
    expect(broken.frame).toBe(824);
    expect(broken.inner).toBe(152);
    expect(broken.scroll).toBe(0);
    expect(broken.footer).toBe(120);
  });

  it('Yoga: with fillInner, scroll viewport is bounded and footer retained', async () => {
    const fixed = await yogaScreenChrome(true);
    expect(fixed.frame).toBe(824);
    expect(fixed.inner).toBe(818);
    expect(fixed.scroll).toBe(666);
    expect(fixed.footer).toBe(120);
    expect(fixed.scroll).toBeGreaterThan(0);
  });

  it('measure helper agrees: fillInner false → zero scroll; true → positive', () => {
    const broken = measureScreenChromeLayout({
      fillInner: false,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 120,
      contentHeight: 1000,
      scrollMode: true,
    });
    expect(broken.scrollViewportHeight).toBe(0);

    const fixed = measureScreenChromeLayout({
      fillInner: true,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 120,
      contentHeight: 1000,
      scrollMode: true,
    });
    expect(fixed.frameHeight).toBe(824);
    expect(fixed.innerHeight).toBe(818);
    expect(fixed.scrollViewportHeight).toBe(666);
    expect(fixed.footerRetained).toBe(true);
  });

  it('non-scroll body mode still gets positive viewport when fillInner', () => {
    const fixed = measureScreenChromeLayout({
      fillInner: true,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 120,
      contentHeight: 200,
      scrollMode: false,
    });
    expect(fixed.scrollViewportHeight).toBe(666);
  });

  it('short content with fill still retains footer and non-zero body', () => {
    const short = measureScreenChromeLayout({
      fillInner: true,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 120,
      contentHeight: 40,
      scrollMode: true,
    });
    expect(short.scrollViewportHeight).toBeGreaterThan(0);
    expect(short.footerRetained).toBe(true);
  });
});
