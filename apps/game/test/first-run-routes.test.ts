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
  it('exposes the shared contract route names; Settings is side-entry only', () => {
    expect(FIRST_RUN_ROUTES).toEqual([
      'Stable',
      'CreateBot',
      'Customise',
      'Opponents',
      'ConfirmFight',
      'Replay',
      'FightResult',
      'Ranking',
      'Settings',
    ]);
    expect(isFirstRunRoute('CreateBot')).toBe(true);
    expect(ROUTE_FLOW).toEqual(['Stable', 'Opponents', 'ConfirmFight', 'Replay', 'Ranking']);
    // Customise is Ludus side-entry — not under Opponents.
    expect(ROUTE_FLOW).not.toContain('Customise');
  });

  it('walks next/prev without inventing extra screens', () => {
    expect(nextRoute('Stable')).toBe('Opponents');
    expect(nextRoute('Ranking')).toBeNull();
    expect(prevRoute('Stable')).toBeNull();
    expect(prevRoute('Opponents')).toBe('Stable');
    expect(prevRoute('Ranking')).toBe('Replay');
    expect(nextRoute('Replay')).toBe('Ranking');
    expect(isFirstRunRoute('Stable')).toBe(true);
    expect(isFirstRunRoute('Settings')).toBe(true);
    expect(isFirstRunRoute('FightResult')).toBe(true);
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
