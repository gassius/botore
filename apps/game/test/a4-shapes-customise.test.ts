import { describe, expect, it } from 'vitest';
import {
  CUSTOMISE_SLOTS,
  buildShapePickerCards,
  isShapeSlot,
} from '../src/garage/customise/customiseSlots';
import { loadoutsEqual } from '../src/garage/loadout/loadoutState';
import { normalizeGarageLoadout } from '../src/garage/loadout/normalizeLoadout';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  STOCK_SHAPE_LOADOUT,
  withUpdatedShape,
} from '../src/garage/loadout/proofCatalogue';
import { parseDesignCaptureCustomiseScenario } from '../src/design-capture/captureEnv';

describe('A4 shapes in Customise', () => {
  it('every Customise tab has selectable content', () => {
    expect(CUSTOMISE_SLOTS.map((s) => [s.id, s.hasContent])).toEqual([
      ['paint', true],
      ['head', true],
      ['body', true],
      ['arms', true],
      ['legs', true],
      ['weapon', true],
    ]);
    expect(CUSTOMISE_SLOTS.filter((s) => isShapeSlot(s.id)).map((s) => s.id)).toEqual([
      'head',
      'body',
      'arms',
      'legs',
    ]);
  });

  it('shape cards list stock first with art, selecting by catalogue id', () => {
    const heads = buildShapePickerCards('head', 'head-welder');
    expect(heads.map((c) => [c.id, c.label, c.selected])).toEqual([
      ['head-visor', 'Visor', false],
      ['head-welder', 'Welder', true],
      ['head-can', 'Can', false],
    ]);
    expect(heads.every((c) => c.kind === 'shape' && c.shapeThumbnail && !c.locked)).toBe(true);
    expect(buildShapePickerCards('legs', 'legs-stock').map((c) => c.selected)).toEqual([
      true,
      false,
    ]);
    expect(buildShapePickerCards('body', 'not-a-shape')[0]!.selected).toBe(true);
  });

  it('pre-A4 loadouts normalize to stock shapes; saved shapes survive', () => {
    const legacy = normalizeGarageLoadout({
      chassis: 'chassis-basic',
      paint: 'paint-cobalt',
      weapon: 'weapon-axe',
      soundTags: ['chassis.light', 'weapon.axe'],
    });
    expect(legacy).toEqual(expect.objectContaining(STOCK_SHAPE_LOADOUT));
    expect(DEFAULT_CONFIRMED_LOADOUT).toEqual(expect.objectContaining(STOCK_SHAPE_LOADOUT));

    const shaped = normalizeGarageLoadout({ ...legacy, head: 'head-can', legs: 'legs-piston' });
    expect(shaped.head).toBe('head-can');
    expect(shaped.legs).toBe('legs-piston');
    expect(shaped.body).toBe('body-chassis');
    expect(shaped.chassis).toBe('chassis-basic');
  });

  it('shape edits dirty the loadout without touching chassis or sound tags', () => {
    const next = withUpdatedShape(DEFAULT_CONFIRMED_LOADOUT, 'body', 'boiler');
    expect(next.body).toBe('body-boiler');
    expect(next.chassis).toBe(DEFAULT_CONFIRMED_LOADOUT.chassis);
    expect(next.soundTags).toEqual(DEFAULT_CONFIRMED_LOADOUT.soundTags);
    expect(loadoutsEqual(next, DEFAULT_CONFIRMED_LOADOUT)).toBe(false);
    expect(
      loadoutsEqual(withUpdatedShape(next, 'body', 'body-chassis'), DEFAULT_CONFIRMED_LOADOUT),
    ).toBe(true);
  });

  it('design-capture parses the A4 Customise scenarios', () => {
    expect(parseDesignCaptureCustomiseScenario('shape-head-welder')).toBe('shape-head-welder');
    expect(parseDesignCaptureCustomiseScenario('boiler')).toBe('shape-body-boiler');
    expect(parseDesignCaptureCustomiseScenario('heaviest')).toBe('shape-heaviest');
    expect(parseDesignCaptureCustomiseScenario('shape-equipped')).toBe('shape-equipped');
    expect(parseDesignCaptureCustomiseScenario('equipped')).toBe('equipped');
  });
});
