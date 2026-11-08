import { describe, expect, it } from 'vitest';
import {
  beginSave,
  confirmSave,
  createLoadoutPreviewState,
  discardPending,
  failSave,
  loadoutsEqual,
  setPendingLoadout,
} from '../src/garage/loadout/loadoutState';
import {
  DEFAULT_CONFIRMED_LOADOUT,
  withUpdatedPaint,
  withUpdatedWeapon,
} from '../src/garage/loadout/proofCatalogue';
import { DevLoadoutSaveAdapter } from '../src/garage/loadout/DevLoadoutSaveAdapter';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { normalizeGarageLoadout } from '../src/garage/loadout/normalizeLoadout';

describe('loadout preview vs confirmed', () => {
  it('marks dirty when pending diverges and discard restores confirmed', () => {
    let state = createLoadoutPreviewState({
      confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
      confirmedVersionId: 'v-1',
    });
    expect(state.dirty).toBe(false);

    const pending = withUpdatedWeapon(
      withUpdatedPaint(state.pendingLoadout, 'paint-cobalt'),
      'weapon-axe',
    );
    state = setPendingLoadout(state, pending);
    expect(state.dirty).toBe(true);
    expect(state.pendingLoadout.paint).toBe('paint-cobalt');
    expect(state.confirmedLoadout.paint).toBe('paint-crimson');

    state = discardPending(state);
    expect(state.dirty).toBe(false);
    expect(loadoutsEqual(state.pendingLoadout, state.confirmedLoadout)).toBe(true);
  });

  it('failed save keeps last confirmed and retains pending preview', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const saver = new DevLoadoutSaveAdapter();
    saver.forceFailNext = true;

    let state = createLoadoutPreviewState({
      confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
      confirmedVersionId: 'before',
    });
    const pending = withUpdatedPaint(state.pendingLoadout, 'paint-cobalt');
    state = setPendingLoadout(state, pending);
    state = beginSave(state);

    const result = await saver.save({
      characterId: 'player-hero',
      loadout: state.pendingLoadout,
      atlasVersion: 'v1',
      accessToken: signed.session.accessToken,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    state = failSave(state, result.message);
    expect(state.confirmedLoadout.paint).toBe('paint-crimson');
    expect(state.confirmedVersionId).toBe('before');
    expect(state.pendingLoadout.paint).toBe('paint-cobalt');
    expect(state.dirty).toBe(true);
    expect(state.lastError).toMatch(/unchanged/i);
  });

  it('successful save promotes pending to confirmed', async () => {
    const auth = new DevAuthAdapter();
    const signed = await auth.signInWithPassword({
      email: 'dev@botore.local',
      password: 'x',
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const saver = new DevLoadoutSaveAdapter();
    let state = createLoadoutPreviewState({
      confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
    });
    const pending = withUpdatedWeapon(state.pendingLoadout, 'weapon-dagger');
    state = setPendingLoadout(state, pending);
    state = beginSave(state);

    const result = await saver.save({
      characterId: 'player-hero',
      loadout: state.pendingLoadout,
      atlasVersion: 'v1',
      accessToken: signed.session.accessToken,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    state = confirmSave(state, {
      loadout: result.loadout,
      loadoutVersionId: result.loadoutVersionId,
      atlasVersion: result.atlasVersion,
    });
    expect(state.dirty).toBe(false);
    expect(state.confirmedLoadout.weapon).toBe('weapon-dagger');
    expect(state.pendingLoadout.weapon).toBe('weapon-dagger');
    expect(state.lastError).toBeNull();
  });

  it('normalizes snake_case sound_tags from server jsonb', () => {
    const loadout = normalizeGarageLoadout({
      chassis: 'chassis-basic',
      paint: 'paint-cobalt',
      weapon: 'weapon-axe',
      shield: null,
      drone: null,
      decals: [],
      sound_tags: ['chassis.light', 'weapon.axe'],
    });
    expect(loadout.soundTags).toEqual(['chassis.light', 'weapon.axe']);
    expect(loadout.paint).toBe('paint-cobalt');
  });
});
