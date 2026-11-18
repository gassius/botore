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

const bot = (id: string, active = false): OwnedBotSummary => ({
  characterId: id,
  displayName: id === 'player-hero' ? 'Hero' : 'Rust Baron',
  wins: 0,
  losses: 0,
  paint: 'paint-crimson',
  weapon: 'weapon-sword',
  atlasVersion: 'v1',
  isActive: active,
});

describe('D5 Ludus carousel metrics + create slot', () => {
  it('snaps one 358×462 card at a time', () => {
    expect(LUDUS_BOT_CAROUSEL.cardWidth).toBe(358);
    expect(LUDUS_BOT_CAROUSEL.cardHeight).toBe(462);
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
  });

  it('never treats bare UUIDs as bot labels in fixture rows', () => {
    const row = bot('player-hero', true);
    expect(row.displayName).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
