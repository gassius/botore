import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_FIRST_RUN_ROUTES, mapChangedFilesToRoutes } from './map-changed-routes.mjs';

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

  it('captures every first-run route when web-preview tooling changes', () => {
    assert.deepEqual(
      mapChangedFilesToRoutes(['scripts/web-preview-capture/capture-routes.mjs']),
      ALL_FIRST_RUN_ROUTES,
    );
    assert.deepEqual(
      mapChangedFilesToRoutes(['scripts/web-preview-capture/map-changed-routes.mjs']),
      ALL_FIRST_RUN_ROUTES,
    );
    assert.deepEqual(
      mapChangedFilesToRoutes(['.github/workflows/web-preview-screenshots.yml']),
      ALL_FIRST_RUN_ROUTES,
    );
  });

  it('captures every first-run route when design-capture helpers change', () => {
    assert.deepEqual(
      mapChangedFilesToRoutes(['apps/game/src/design-capture/captureEnv.ts']),
      ALL_FIRST_RUN_ROUTES,
    );
  });
});
