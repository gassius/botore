import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LUDUS_BOT_CAROUSEL,
  ludusBotCarouselSnapInterval,
} from '../src/garage-tag/snap/snapMetrics';
import {
  buildLudusCarouselItems,
  ludusCarouselShowsCreate,
} from '../src/garage/ludus/ludusCarouselModel';
import type { OwnedBotSummary } from '../src/garage/loadout/loadoutTypes';
import { STABLE_HOME_TITLE } from '../src/garage/stableHomeCopy';
import { parseDesignCaptureHomeScenario } from '../src/design-capture/captureEnv';

/** M1: Ludus card must forward equipped shapes into BotAssemblerSlot. */
function ludusCardSource(): string {
  return readSource('src/garage/ludus/LudusBotCard.tsx');
}

const ROOT = process.cwd();

function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const bot = (id: string, active = false): OwnedBotSummary => ({
  characterId: id,
  displayName: id === 'player-hero' ? 'Hero' : 'Rust Baron',
  wins: 0,
  losses: 0,
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
  head: 'head-visor',
  body: 'body-chassis',
  arms: 'arms-stock',
  legs: 'legs-stock',
  atlasVersion: 'v1',
  isActive: active,
});

describe('D5 Ludus carousel metrics + create slot', () => {
  it('snaps one 358×400 card at a time (room for dots + ~16pt gap)', () => {
    expect(LUDUS_BOT_CAROUSEL.cardWidth).toBe(358);
    expect(LUDUS_BOT_CAROUSEL.cardHeight).toBe(400);
    expect(LUDUS_BOT_CAROUSEL.visibleCount).toBe(1);
    expect(ludusBotCarouselSnapInterval()).toBe(358);
  });

  it('shows Create slot only under cap', () => {
    expect(ludusCarouselShowsCreate([bot('a', true)], 3)).toBe(true);
    expect(ludusCarouselShowsCreate([bot('a'), bot('b'), bot('c')], 3)).toBe(false);
    const items = buildLudusCarouselItems([bot('a', true), bot('b')], 3);
    expect(items).toHaveLength(3);
    expect(items[2]).toEqual({ kind: 'create', slotNumber: 3, cap: 3 });
  });

  it('keeps Ludus title and home capture aliases', () => {
    expect(STABLE_HOME_TITLE).toBe('Ludus');
    expect(parseDesignCaptureHomeScenario('more')).toBe('more');
    expect(parseDesignCaptureHomeScenario('bot')).toBe('bot');
    expect(parseDesignCaptureHomeScenario('create-slot')).toBe('create-slot');
    expect(parseDesignCaptureHomeScenario('at-cap')).toBe('at-cap');
  });

  it('never treats bare UUIDs as bot labels in fixture rows', () => {
    const row = bot('player-hero', true);
    expect(row.displayName).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('selectActiveBot path does not set booting (source gate for D5 snap)', () => {
    // PRR B1: carousel snap must keep Ludus mounted — LoadoutSessionContext
    // selectActiveBot must not call setBooting(true).
    const src = readSource('src/garage/LoadoutSessionContext.tsx');
    const selectBlock = src.slice(
      src.indexOf('selectActiveBot: async'),
      src.indexOf('suggestBotName: async'),
    );
    expect(selectBlock).toContain('hydrate({ selectEpoch: epoch })');
    expect(selectBlock).not.toContain('setBooting(true)');
  });

  it('chevrons do not double-fire handleSnap (source)', () => {
    const src = readSource('src/garage/ludus/LudusBotCarousel.tsx');
    expect(src).toContain('scrollToIndex(index - 1, true)');
    expect(src).toContain('scrollToIndex(index + 1, true)');
    expect(src).not.toMatch(/scrollToIndex\([^)]+\);\s*handleSnap\(/);
  });

  it('LudusBotCard forwards A4 shape slots into BotAssemblerSlot (M1)', () => {
    const src = ludusCardSource();
    expect(src).toContain('bot.head');
    expect(src).toContain('bot.body');
    expect(src).toContain('bot.arms');
    expect(src).toContain('bot.legs');
  });
});
