/**
 * D4 Ranking UI — Bots | Botores tabs, portraits, W–L, pull-to-refresh, no IDs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePaintVisual } from '../src/assembler/paints';
import { FixtureRankingReadAdapter } from '../src/ranking/adapters/FixtureRankingReadAdapter';
import {
  DEV_POPULATED_BOTORE_ROWS,
  DEV_POPULATED_RANKING_ROWS,
} from '../src/ranking/fixtures/devRankingFixtures';
import {
  attachBotPaintsToBotoreRows,
  applyRankingLoadResult,
  beginRankingLoad,
  createInitialRankingSession,
  selectRankingTab,
} from '../src/ranking/rankingSession';
import {
  RANKING_ROW_MIN_HEIGHT,
  RANKING_SCREEN_CHROME_SCROLL,
} from '../src/ranking/rankingScrollContract';
import {
  rankingTabForCaptureScenario,
  parseDesignCaptureRankingScenario,
} from '../src/design-capture/captureEnv';
import { createRankingReadClient } from '../src/ranking/createRankingReadClient';
import { measureScreenChromeLayout } from '../src/garage-tag/screenChromeLayout';

function readSource(relative: string): string {
  return readFileSync(join(__dirname, '..', relative), 'utf8');
}

describe('D4 Ranking UI contracts', () => {
  it('keeps ScreenChrome scrolling + ~60pt rows + 390×844 chrome budget', () => {
    expect(RANKING_SCREEN_CHROME_SCROLL).toBe(true);
    expect(RANKING_ROW_MIN_HEIGHT).toBe(60);
    const layout = measureScreenChromeLayout({
      fillInner: true,
      viewportHeight: 844,
      safePadding: 10,
      panelBorder: 3,
      innerPadding: 16,
      footerHeight: 0,
      contentHeight: 600,
      scrollMode: true,
    });
    expect(layout.scrollViewportHeight).toBeGreaterThan(500);
  });

  it('screen source: tabs, pull-to-refresh, no LIVE/Refresh/Back to Stable footer', () => {
    const src = readSource('src/screens/RankingScreen.tsx');
    expect(src).toContain('ranking-tabs');
    expect(src).toContain('ranking-tab-${tab.id}');
    expect(src).toContain("id: 'bots'");
    expect(src).toContain("id: 'botores'");
    expect(src).toContain('RefreshControl');
    expect(src).toContain('RankingPortrait');
    expect(src).toContain('BotoreEmblem');
    expect(src).toContain('W–L');
    expect(src).toContain('YOU');
    expect(src).not.toContain('Back to stable');
    expect(src).not.toContain('testID="ranking-refresh"');
    expect(src).not.toContain('testID="ranking-back"');
    expect(src).not.toMatch(/\bLIVE\b/);
    expect(src).not.toContain("'PILOT'");
  });

  it('fixtures expose distinct paints, W–L, botore names — no universal Pilot', async () => {
    const port = new FixtureRankingReadAdapter({ scenario: 'populated' });
    const bots = await port.list();
    const botores = await port.listBotores();
    expect(bots.length).toBeGreaterThanOrEqual(5);
    expect(botores.length).toBeGreaterThanOrEqual(3);
    expect(bots.every((r) => r.displayName.toUpperCase() !== 'PILOT')).toBe(true);
    expect(bots.some((r) => r.isCurrentBot)).toBe(true);
    expect(bots.every((r) => typeof r.wins === 'number' && typeof r.losses === 'number')).toBe(
      true,
    );
    const paints = new Set(bots.map((r) => resolvePaintVisual(r.portrait?.paint ?? '').visual));
    expect(paints.size).toBeGreaterThanOrEqual(2);
    expect(botores.some((r) => r.isCurrentBotore)).toBe(true);
    expect(botores.every((r) => r.botsOwned >= 1)).toBe(true);
  });

  it('session switches tabs without inventing ranks; joins mini-head paints', () => {
    let state = createInitialRankingSession('bots');
    state = applyRankingLoadResult(state, {
      kind: 'ok',
      tab: 'bots',
      rows: DEV_POPULATED_RANKING_ROWS,
    });
    expect(state.phase).toBe('populated');
    expect(state.botRows[0]?.rank).toBe(DEV_POPULATED_RANKING_ROWS[0]?.rank);

    state = selectRankingTab(state, 'botores');
    expect(state.tab).toBe('botores');
    expect(state.phase).toBe('idle');
    state = beginRankingLoad(state);
    state = applyRankingLoadResult(state, {
      kind: 'ok',
      tab: 'botores',
      rows: DEV_POPULATED_BOTORE_ROWS.map((r) => ({ ...r, botPaints: [] })),
    });
    const joined = attachBotPaintsToBotoreRows(state.botoreRows, state.botRows);
    const volta = joined.find((r) => r.botoreId === 'dev-botore-volta');
    expect(volta?.botPaints.length).toBeGreaterThan(0);
  });

  it('portrait paint resolves Oxide vs Petrol for ranking heads', () => {
    expect(resolvePaintVisual('paint-crimson').visual).toBe('oxide');
    expect(resolvePaintVisual('paint-cobalt').visual).toBe('petrol');
    // RankingPortrait module must not require kit sample portrait sheets.
    const portrait = readSource('src/ranking/RankingPortrait.tsx');
    expect(portrait).toContain('parts/head-oxide.png');
    expect(portrait).toContain('parts/head-petrol.png');
    expect(portrait).not.toContain('portraits/oxide-');
    expect(portrait).not.toContain('PLACEHOLDER');
  });

  it('design-capture ranking scenarios pick tab + fixture ports', async () => {
    expect(parseDesignCaptureRankingScenario('bots')).toBe('bots');
    expect(parseDesignCaptureRankingScenario('botores')).toBe('botores');
    expect(parseDesignCaptureRankingScenario('loading')).toBe('loading');
    expect(rankingTabForCaptureScenario('bots')).toBe('bots');
    expect(rankingTabForCaptureScenario('botores')).toBe('botores');
    expect(rankingTabForCaptureScenario('loading')).toBe('bots');

    const slot = readSource('src/first-run/slots/RankingSlot.tsx');
    expect(slot).toContain('rankingTabForCaptureScenario');
    expect(slot).toContain('initialTab');

    const botsPort = createRankingReadClient({ captureScenario: 'bots' });
    expect((await botsPort.list()).length).toBeGreaterThan(0);
    const botorePort = createRankingReadClient({ captureScenario: 'botores' });
    expect((await botorePort.listBotores()).length).toBeGreaterThan(0);
  });
});
