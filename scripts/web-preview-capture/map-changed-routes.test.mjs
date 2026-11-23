import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapChangedFilesToRoutes } from './map-changed-routes.mjs';

describe('mapChangedFilesToRoutes', () => {
  it('maps confirm fight UI to ConfirmFight', () => {
    assert.deepEqual(mapChangedFilesToRoutes(['apps/game/src/garage-tag/ConfirmFightScreen.tsx']), [
      'ConfirmFight',
    ]);
  });

  it('maps ranking paths', () => {
    assert.deepEqual(mapChangedFilesToRoutes(['apps/game/src/ranking/RankingScreen.tsx']), [
      'Ranking',
    ]);
  });

  it('defaults Stable when empty (job still ran)', () => {
    assert.deepEqual(mapChangedFilesToRoutes(['README.md']), ['Stable']);
  });

  it('covers assets with a small first-run set', () => {
    const routes = mapChangedFilesToRoutes(['apps/game/assets/a6-paints-v4/foo.png']);
    assert.ok(routes.includes('Stable'));
    assert.ok(routes.includes('ConfirmFight'));
  });
});
