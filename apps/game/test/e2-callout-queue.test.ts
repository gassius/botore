/**
 * E2 / D10 — Fight View call-out queue: 1.2 s dwell, collapse ×n, pending cap.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIGHT_VIEW_CALLOUT_MIN_DWELL_MS,
  FIGHT_VIEW_CALLOUT_QUEUE_MAX,
  advanceCalloutQueue,
  enqueueCallout,
  formatCalloutHeadline,
  initialCalloutQueueState,
  isMajorCallout,
  msUntilCalloutAdvance,
  resetCalloutQueue,
  trimCalloutPending,
} from '../src/fight-view/calloutQueue';
import {
  FIGHT_VIEW_ARENA_NAME,
  FIGHT_VIEW_ARENA_TAG_LEFT,
  FIGHT_VIEW_ARENA_TAG_LEFT_BESIDE_BACK,
  FIGHT_VIEW_BAND_CONTENT_HEIGHT,
  FIGHT_VIEW_CALLOUT_PLATE_HEIGHT,
  arenaLocationTagLeft,
  formatArenaLocationLabel,
  fightViewShellHeights,
} from '../src/fight-view/types';

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

const hit = { headline: 'Hit!', detail: 'Chispa lands a hit on Sir Bot' } as const;
const dodge = { headline: 'Dodge!', detail: 'Sir Bot slips aside' } as const;
const heavy = {
  headline: 'Heavy hit!',
  detail: "Chispa's weapon lands — Sir Bot staggers",
} as const;
const ko = { headline: 'KO!', detail: 'Sir Bot is down' } as const;
const strike = { headline: 'Strike!', detail: 'Chispa swings' } as const;

describe('E2 call-out dwell + queue (D10)', () => {
  it('documents a 1.2 s minimum dwell', () => {
    expect(FIGHT_VIEW_CALLOUT_MIN_DWELL_MS).toBe(1200);
  });

  it('shows the first callout immediately and holds through min dwell', () => {
    let state = initialCalloutQueueState();
    state = enqueueCallout(state, hit, 0);
    expect(state.current?.callout).toEqual(hit);
    expect(state.current?.count).toBe(1);
    expect(state.shownAtMs).toBe(0);

    state = enqueueCallout(state, dodge, 400);
    expect(state.current?.callout).toEqual(hit);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.callout).toEqual(dodge);

    expect(msUntilCalloutAdvance(state, 400)).toBe(800);
    expect(advanceCalloutQueue(state, 1199).current?.callout).toEqual(hit);

    state = advanceCalloutQueue(state, 1200);
    expect(state.current?.callout).toEqual(dodge);
    expect(state.pending).toHaveLength(0);
    expect(state.shownAtMs).toBe(1200);
  });

  it('collapses identical current plates with ×n without resetting dwell', () => {
    let state = enqueueCallout(initialCalloutQueueState(), hit, 0);
    state = enqueueCallout(state, hit, 300);
    state = enqueueCallout(state, hit, 600);
    expect(state.current?.count).toBe(3);
    expect(state.shownAtMs).toBe(0);
    expect(state.pending).toHaveLength(0);
    expect(formatCalloutHeadline(hit, 3)).toBe('Hit ×3');
  });

  it('collapses identical pending plates', () => {
    let state = enqueueCallout(initialCalloutQueueState(), dodge, 0);
    state = enqueueCallout(state, hit, 100);
    state = enqueueCallout(state, hit, 200);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]?.count).toBe(2);
  });

  it('promotes immediately when dwell has elapsed and nothing is pending', () => {
    let state = enqueueCallout(initialCalloutQueueState(), hit, 0);
    state = enqueueCallout(state, dodge, 1200);
    expect(state.current?.callout).toEqual(dodge);
    expect(state.pending).toHaveLength(0);
    expect(state.shownAtMs).toBe(1200);
  });

  it('ignores null so KO survives quiet / victory_screen commands', () => {
    let state = enqueueCallout(initialCalloutQueueState(), ko, 0);
    state = enqueueCallout(state, null, 500);
    expect(state.current?.callout).toEqual(ko);
  });

  it('caps pending at 3, dropping oldest minors before majors', () => {
    expect(FIGHT_VIEW_CALLOUT_QUEUE_MAX).toBe(3);
    expect(isMajorCallout(ko)).toBe(true);
    expect(isMajorCallout(heavy)).toBe(true);
    expect(isMajorCallout(hit)).toBe(false);

    let state = enqueueCallout(initialCalloutQueueState(), strike, 0);
    state = enqueueCallout(state, hit, 10);
    state = enqueueCallout(state, dodge, 20);
    state = enqueueCallout(state, { headline: 'Strike!', detail: 'Sir Bot swings' }, 30);
    state = enqueueCallout(state, heavy, 40);
    // pending was hit, dodge, Strike(Sir Bot), Heavy — trim drops oldest minors first.
    expect(state.pending.length).toBeLessThanOrEqual(FIGHT_VIEW_CALLOUT_QUEUE_MAX);
    expect(state.pending.some((p) => p.callout.headline === 'Heavy hit!')).toBe(true);

    const trimmed = trimCalloutPending(
      [
        { callout: hit, count: 1 },
        { callout: dodge, count: 1 },
        { callout: strike, count: 1 },
        { callout: ko, count: 1 },
      ],
      3,
    );
    expect(trimmed).toHaveLength(3);
    expect(trimmed.some((p) => p.callout.headline === 'KO!')).toBe(true);
    expect(trimmed[0]?.callout.headline).not.toBe('Hit!');
  });

  it('reset clears the visible plate', () => {
    let state = enqueueCallout(initialCalloutQueueState(), hit, 0);
    state = resetCalloutQueue();
    expect(state.current).toBeNull();
    expect(state.pending).toHaveLength(0);
  });
});

describe('E2 fixed band + arena location tag (D10)', () => {
  it('keeps a fixed 96 px plate inside the 148 band so 390×844 arena ≥75%', () => {
    expect(FIGHT_VIEW_CALLOUT_PLATE_HEIGHT).toBe(96);
    expect(FIGHT_VIEW_BAND_CONTENT_HEIGHT).toBe(148);
    const shell = fightViewShellHeights(844, FIGHT_VIEW_BAND_CONTENT_HEIGHT);
    expect(shell.arenaRatio).toBeGreaterThanOrEqual(0.75);
    expect(shell.arenaHeight + shell.bandHeight).toBe(844);
  });

  it('band styles honour constant height empty or filled (D10 mockup)', () => {
    const band = readSource('src/fight-view/FightViewBottomBand.tsx');
    expect(band).toContain('height: FIGHT_VIEW_BAND_CONTENT_HEIGHT');
    expect(band).toContain('height: FIGHT_VIEW_CALLOUT_PLATE_HEIGHT');
    expect(band).toContain("borderStyle: 'dashed'");
    expect(band).toContain('#c9b896');
    expect(band).toContain('garageTag.white');
    expect(band).toContain('garageTag.oxide');
    expect(band).toContain('FIGHT_VIEW_CALLOUT_MIN_DWELL_MS');
    expect(band).not.toContain('styles.rivet');
    expect(band).not.toContain('Repair Yard');
    expect(band).not.toContain('arena-name');
  });

  it('arena tag reads ARENA · REPAIR YARD inside the arena, not a bottom pill', () => {
    expect(FIGHT_VIEW_ARENA_NAME).toBe('Repair Yard');
    expect(formatArenaLocationLabel()).toBe('ARENA · REPAIR YARD');
    const tag = readSource('src/fight-view/ArenaLocationTag.tsx');
    expect(tag).toContain('formatArenaLocationLabel');
    expect(tag).toContain('pointerEvents="none"');
    const slot = readSource('src/first-run/slots/ReplaySlot.tsx');
    expect(slot).toContain('ArenaLocationTag');
    expect(slot).toContain('FIGHT_VIEW_HUD_BELOW_INSET');
    expect(slot).toContain('arenaLocationTagLeft(isRewatch)');
    expect(slot).not.toContain('arenaName=');
  });

  it('rewatch insets the arena tag past the Back chevron; first watch keeps mockup left', () => {
    expect(arenaLocationTagLeft(false)).toBe(FIGHT_VIEW_ARENA_TAG_LEFT);
    expect(arenaLocationTagLeft(true)).toBe(FIGHT_VIEW_ARENA_TAG_LEFT_BESIDE_BACK);
    expect(FIGHT_VIEW_ARENA_TAG_LEFT_BESIDE_BACK).toBeGreaterThanOrEqual(10 + 48 + 8);
  });
});
