import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_ROUTES,
  isFirstRunRoute,
  nextRoute,
  prevRoute,
  ROUTE_FLOW,
} from '../src/first-run/routes';
import { garageTag } from '../src/garage-tag/tokens';

describe('first-run routes', () => {
  it('exposes the shared contract route names in order', () => {
    expect(FIRST_RUN_ROUTES).toEqual([
      'Stable',
      'Customise',
      'Opponents',
      'ConfirmFight',
      'Replay',
      'FightResult',
      'Ranking',
    ]);
    expect(ROUTE_FLOW).toEqual([...FIRST_RUN_ROUTES]);
  });

  it('walks next/prev without inventing extra screens', () => {
    expect(nextRoute('Stable')).toBe('Customise');
    expect(nextRoute('Ranking')).toBeNull();
    expect(prevRoute('Stable')).toBeNull();
    expect(prevRoute('Ranking')).toBe('FightResult');
    expect(isFirstRunRoute('Stable')).toBe(true);
    expect(isFirstRunRoute('Shop')).toBe(false);
  });
});

describe('garage tag candidate tokens', () => {
  it('keeps kit candidate colours and geometry labelled as candidates', () => {
    expect(garageTag.kitStatus).toBe('candidate');
    expect(garageTag.kitVersion).toBe('0.1.0');
    expect(garageTag.cream).toBe('#F4E4C8');
    expect(garageTag.mustard).toBe('#F4B820');
    expect(garageTag.cutCorner).toBe(10);
    expect(garageTag.outline).toBe(3);
    expect(garageTag.touchMin).toBe(48);
  });
});
