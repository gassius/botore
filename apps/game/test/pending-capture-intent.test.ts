import { describe, expect, it, beforeEach } from 'vitest';
import {
  mergeCaptureFileIntent,
  peekCaptureIntent,
  consumeCaptureRoute,
  resetCaptureIntentForTests,
} from '../src/design-capture/captureIntentState';

describe('captureIntentState merge + consume', () => {
  beforeEach(() => {
    resetCaptureIntentForTests();
  });

  it('drops invalid routes and trims paint/weapon ids', () => {
    mergeCaptureFileIntent({
      route: 'NotARoute',
      paintId: '  petrol  ',
      weaponId: ' axe ',
      mute: true,
    });
    expect(peekCaptureIntent()).toEqual({
      route: null,
      paintId: 'petrol',
      weaponId: 'axe',
      mute: true,
      battleId: null,
      rankingScenario: null,
      failClosed: null,
      poseCompare: null,
      sessionFailure: null,
      fightViewMode: null,
      customiseScenario: null,
      resultScenario: null,
    });
  });

  it('keeps prior route when a later merge omits route', () => {
    mergeCaptureFileIntent({ route: 'Replay', paintId: null, weaponId: null, mute: null });
    mergeCaptureFileIntent({
      route: null,
      paintId: 'oxide',
      weaponId: null,
      mute: false,
    });
    expect(peekCaptureIntent()).toEqual({
      route: 'Replay',
      paintId: 'oxide',
      weaponId: null,
      mute: false,
      battleId: null,
      rankingScenario: null,
      failClosed: null,
      poseCompare: null,
      sessionFailure: null,
      fightViewMode: null,
      customiseScenario: null,
      resultScenario: null,
    });
  });

  it('consumeCaptureRoute clears only the route', () => {
    mergeCaptureFileIntent({
      route: 'ConfirmFight',
      paintId: 'petrol',
      weaponId: 'dagger',
      mute: null,
      battleId: '11780c0f-39b3-41fc-b364-64a2769ef013',
      rankingScenario: 'live',
    });
    expect(consumeCaptureRoute()).toBe('ConfirmFight');
    expect(peekCaptureIntent()).toEqual({
      route: null,
      paintId: 'petrol',
      weaponId: 'dagger',
      mute: null,
      battleId: '11780c0f-39b3-41fc-b364-64a2769ef013',
      rankingScenario: 'live',
      failClosed: null,
      poseCompare: null,
      sessionFailure: null,
      fightViewMode: null,
      customiseScenario: null,
      resultScenario: null,
    });
    expect(consumeCaptureRoute()).toBeNull();
  });

  it('accepts failClosed for C8 blocked-UI evidence', () => {
    mergeCaptureFileIntent({ failClosed: true });
    expect(peekCaptureIntent().failClosed).toBe(true);
  });

  it('accepts poseCompare for C11 heavy-hit stills', () => {
    mergeCaptureFileIntent({ poseCompare: 'quick-vs-heavy' });
    expect(peekCaptureIntent().poseCompare).toBe('quick-vs-heavy');
  });

  it('accepts sessionFailure for C10 offline/auth-expired stills', () => {
    mergeCaptureFileIntent({ sessionFailure: 'offline' });
    expect(peekCaptureIntent().sessionFailure).toBe('offline');
    mergeCaptureFileIntent({ sessionFailure: 'auth_expired' });
    expect(peekCaptureIntent().sessionFailure).toBe('auth_expired');
  });

  it('accepts customiseScenario for D3 Customise stills', () => {
    mergeCaptureFileIntent({ route: 'Customise', customiseScenario: 'paint-dirty' });
    expect(peekCaptureIntent().customiseScenario).toBe('paint-dirty');
    mergeCaptureFileIntent({ customise: 'weapon-soon' });
    expect(peekCaptureIntent().customiseScenario).toBe('weapon-soon');
  });

  it('accepts resultScenario for E1 FightResult victory/defeat stills', () => {
    mergeCaptureFileIntent({ route: 'FightResult', resultScenario: 'victory' });
    expect(peekCaptureIntent().resultScenario).toBe('victory');
    mergeCaptureFileIntent({ result: 'defeat' });
    expect(peekCaptureIntent().resultScenario).toBe('defeat');
  });
});
