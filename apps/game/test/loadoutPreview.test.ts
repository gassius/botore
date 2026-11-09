import { describe, expect, it } from 'vitest';
import {
  beginSave,
  confirmSave,
  createLoadoutPreviewState,
  createUnavailableLoadoutState,
  discardPending,
  failSave,
  loadoutsEqual,
  markHydrationUnavailable,
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

const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-0000000000bb';

function readyState(
  loadout = DEFAULT_CONFIRMED_LOADOUT,
  opts?: { accountId?: string; characterId?: string; versionId?: string },
) {
  return createLoadoutPreviewState({
    accountId: opts?.accountId ?? ACCOUNT_A,
    characterId: opts?.characterId ?? 'player-hero',
    displayName: 'Hero',
    confirmedLoadout: loadout,
    confirmedVersionId: opts?.versionId ?? 'v-1',
  });
}

describe('loadout preview vs confirmed', () => {
  it('marks dirty when pending diverges and discard restores confirmed', () => {
    let state = readyState();
    expect(state.dirty).toBe(false);

    const pending = withUpdatedWeapon(
      withUpdatedPaint(state.pendingLoadout!, 'paint-cobalt'),
      'weapon-axe',
    );
    state = setPendingLoadout(state, pending);
    expect(state.dirty).toBe(true);
    expect(state.pendingLoadout!.paint).toBe('paint-cobalt');
    expect(state.confirmedLoadout!.paint).toBe('paint-crimson');

    state = discardPending(state);
    expect(state.dirty).toBe(false);
    expect(loadoutsEqual(state.pendingLoadout!, state.confirmedLoadout!)).toBe(true);
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

    let state = readyState(DEFAULT_CONFIRMED_LOADOUT, { versionId: 'before' });
    const pending = withUpdatedPaint(state.pendingLoadout!, 'paint-cobalt');
    state = setPendingLoadout(state, pending);
    state = beginSave(state);

    const result = await saver.save({
      characterId: 'player-hero',
      loadout: state.pendingLoadout!,
      atlasVersion: 'v1',
      accessToken: signed.session.accessToken,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    state = failSave(state, result.message);
    expect(state.confirmedLoadout!.paint).toBe('paint-crimson');
    expect(state.confirmedVersionId).toBe('before');
    expect(state.pendingLoadout!.paint).toBe('paint-cobalt');
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
    let state = readyState();
    const pending = withUpdatedWeapon(state.pendingLoadout!, 'weapon-dagger');
    state = setPendingLoadout(state, pending);
    state = beginSave(state);

    const result = await saver.save({
      characterId: 'player-hero',
      loadout: state.pendingLoadout!,
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
    expect(state.confirmedLoadout!.weapon).toBe('weapon-dagger');
    expect(state.pendingLoadout!.weapon).toBe('weapon-dagger');
    expect(state.lastError).toBeNull();
  });

  it('does not invent confirmed equipment when hydration fails for a non-default build', () => {
    const axeBuild = withUpdatedWeapon(DEFAULT_CONFIRMED_LOADOUT, 'weapon-axe');
    const previous = readyState(axeBuild, {
      accountId: ACCOUNT_A,
      characterId: 'player-hero',
    });
    expect(previous.confirmedLoadout!.weapon).toBe('weapon-axe');

    // Different account failure must not keep prior confirmed or invent defaults.
    const other = markHydrationUnavailable(previous, {
      accountId: ACCOUNT_B,
      characterId: 'other-pilot',
      displayName: 'Other',
      message: 'network blip',
    });
    expect(other.hydration).toBe('unavailable');
    expect(other.confirmedLoadout).toBeNull();
    expect(other.pendingLoadout).toBeNull();
    expect(other.dirty).toBe(false);
    expect(other.lastError).toMatch(/network/i);

    // Same account may keep the last confirmed snapshot for display, but stay blocked.
    const same = markHydrationUnavailable(previous, {
      accountId: ACCOUNT_A,
      characterId: 'player-hero',
      message: 'transient 401',
    });
    expect(same.hydration).toBe('unavailable');
    expect(same.confirmedLoadout!.weapon).toBe('weapon-axe');
    expect(same.dirty).toBe(false);
    expect(same.lastError).toMatch(/401/);
  });

  it('cold start stays unavailable with no fabricated sword/crimson confirmed', () => {
    const cold = createUnavailableLoadoutState({ message: 'not hydrated' });
    expect(cold.hydration).toBe('unavailable');
    expect(cold.confirmedLoadout).toBeNull();
    expect(cold.pendingLoadout).toBeNull();
  });

  it('rejects pending edits while saving; late response rebases newer pending', () => {
    let state = readyState();
    const petrol = withUpdatedPaint(state.pendingLoadout!, 'paint-cobalt');
    state = setPendingLoadout(state, petrol);
    state = beginSave(state);
    expect(state.saving).toBe(true);
    expect(state.saveRequestLoadout!.paint).toBe('paint-cobalt');

    // Attempted edit during save is ignored by setPendingLoadout.
    const axeWhileSaving = withUpdatedWeapon(state.pendingLoadout!, 'weapon-axe');
    const locked = setPendingLoadout(state, axeWhileSaving);
    expect(locked.pendingLoadout!.weapon).toBe('weapon-sword');
    expect(locked.saving).toBe(true);

    // Simulate a race if pending did move: confirmSave rebases instead of clobbering.
    const raced = {
      ...state,
      pendingLoadout: axeWhileSaving,
      dirty: true,
    };
    const confirmed = confirmSave(raced, {
      loadout: petrol,
      loadoutVersionId: 'after-petrol',
      atlasVersion: 'v1',
    });
    expect(confirmed.confirmedLoadout!.paint).toBe('paint-cobalt');
    expect(confirmed.confirmedLoadout!.weapon).toBe('weapon-sword');
    expect(confirmed.pendingLoadout!.weapon).toBe('weapon-axe');
    expect(confirmed.dirty).toBe(true);
    expect(confirmed.saving).toBe(false);
  });

  it('resolves distinct owned characters for two accounts via the save port', async () => {
    const saver = new DevLoadoutSaveAdapter();
    const axeBuild = withUpdatedWeapon(DEFAULT_CONFIRMED_LOADOUT, 'weapon-axe');
    saver.extraOwned = {
      characterId: 'pilot-bravo',
      displayName: 'Bravo',
      loadout: axeBuild,
    };

    const hero = await saver.resolveOwnedCharacter('dev-access-token');
    expect(hero.ok).toBe(true);
    if (!hero.ok) return;
    expect(hero.character.characterId).toBe('player-hero');

    const bravo = await saver.resolveOwnedCharacter('token-for-pilot-bravo');
    expect(bravo.ok).toBe(true);
    if (!bravo.ok) return;
    expect(bravo.character.characterId).toBe('pilot-bravo');

    const heroLoadout = await saver.fetchCurrent({
      characterId: hero.character.characterId,
      accessToken: 'dev-access-token',
    });
    const bravoLoadout = await saver.fetchCurrent({
      characterId: bravo.character.characterId,
      accessToken: 'token-for-pilot-bravo',
    });
    expect(heroLoadout.ok).toBe(true);
    expect(bravoLoadout.ok).toBe(true);
    if (!heroLoadout.ok || !bravoLoadout.ok) return;
    expect(heroLoadout.snapshot.loadout.weapon).toBe('weapon-sword');
    expect(bravoLoadout.snapshot.loadout.weapon).toBe('weapon-axe');
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
