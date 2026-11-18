import { describe, expect, it } from 'vitest';
import { FixtureRankingReadAdapter } from '../src/ranking/adapters/FixtureRankingReadAdapter';
import { UnavailableContractRankingReadAdapter } from '../src/ranking/adapters/UnavailableContractRankingReadAdapter';
import {
  DEV_EMPTY_RANKING_ROWS,
  DEV_OVERFLOW_RANKING_ROWS,
  DEV_POPULATED_RANKING_ROWS,
  DEV_PRESERVE_ORDER_ROWS,
  DEV_RANKING_FIXTURE_LABEL,
} from '../src/ranking/fixtures/devRankingFixtures';
import {
  RankingContractUnavailableError,
  type RankingReadPort,
} from '../src/ranking/RankingReadPort';
import { createRankingLoadController } from '../src/ranking/rankingLoadController';
import {
  applyRankingLoadResult,
  beginRankingLoad,
  createInitialRankingSession,
  loadRankingFromPort,
  rankingRowAccessibilityLabel,
} from '../src/ranking/rankingSession';
import {
  RANKING_SCREEN_CHROME_SCROLL,
  RANKING_SHORT_VIEWPORT_HEIGHT,
  rankingContentExceedsShortViewport,
} from '../src/ranking/rankingScrollContract';
import type { RankingRow, RankingSessionState } from '../src/ranking/types';

describe('DEV ranking fixtures', () => {
  it('labels every fixture row as development data', () => {
    expect(DEV_RANKING_FIXTURE_LABEL).toBe('DEV');
    for (const row of DEV_POPULATED_RANKING_ROWS) {
      expect(row.source).toBe('dev-fixture');
      expect(row.displayName.length).toBeGreaterThan(0);
      expect(row.botoreName.length).toBeGreaterThan(0);
    }
  });

  it('marks current-bot ownership with an explicit flag (not paint)', () => {
    const current = DEV_POPULATED_RANKING_ROWS.filter((r) => r.isCurrentBot);
    expect(current).toHaveLength(1);
    expect(current[0]?.botId).toBe('dev-bot-chispa');
  });
});

describe('FixtureRankingReadAdapter', () => {
  it('returns populated DEV rows without reordering', async () => {
    const port = new FixtureRankingReadAdapter({
      scenario: 'populated',
      rows: DEV_PRESERVE_ORDER_ROWS,
    });
    const rows = await port.list();
    expect(rows.map((r) => r.rank)).toEqual([7, 2, 99]);
    expect(rows.map((r) => r.botId)).toEqual([
      'dev-bot-seventh',
      'dev-bot-second',
      'dev-bot-ninetynine',
    ]);
  });

  it('returns an empty list for the empty scenario', async () => {
    const port = new FixtureRankingReadAdapter({ scenario: 'empty' });
    await expect(port.list()).resolves.toEqual(DEV_EMPTY_RANKING_ROWS);
  });

  it('rejects for the error scenario', async () => {
    const port = new FixtureRankingReadAdapter({
      scenario: 'error',
      errorMessage: 'boom',
    });
    await expect(port.list()).rejects.toThrow('boom');
  });
});

describe('UnavailableContractRankingReadAdapter', () => {
  it('fails closed with RankingContractUnavailableError', async () => {
    const port = new UnavailableContractRankingReadAdapter();
    await expect(port.list()).rejects.toBeInstanceOf(RankingContractUnavailableError);
    await expect(port.listBotores()).rejects.toBeInstanceOf(RankingContractUnavailableError);
  });
});

describe('ranking session state machine', () => {
  it('starts idle then loading on first fetch', () => {
    const idle = createInitialRankingSession();
    expect(idle.phase).toBe('idle');
    expect(beginRankingLoad(idle).phase).toBe('loading');
  });

  it('maps populated / empty / error / unavailable results', () => {
    const base = createInitialRankingSession();

    const populated = applyRankingLoadResult(base, {
      kind: 'ok',
      tab: 'bots',
      rows: DEV_POPULATED_RANKING_ROWS,
    });
    expect(populated.phase).toBe('populated');
    expect(populated.botRows).toHaveLength(DEV_POPULATED_RANKING_ROWS.length);

    const empty = applyRankingLoadResult(base, { kind: 'ok', tab: 'bots', rows: [] });
    expect(empty.phase).toBe('empty');

    const errored = applyRankingLoadResult(base, {
      kind: 'error',
      message: 'nope',
      code: 'boom',
    });
    expect(errored.phase).toBe('error');
    expect(errored.errorMessage).toBe('nope');

    const blocked = applyRankingLoadResult(base, {
      kind: 'unavailable_contract',
      message: 'blocked',
    });
    expect(blocked.phase).toBe('unavailable_contract');
  });

  it('keeps prior rows when a refresh fails', () => {
    let state = applyRankingLoadResult(createInitialRankingSession(), {
      kind: 'ok',
      tab: 'bots',
      rows: DEV_POPULATED_RANKING_ROWS,
    });
    state = beginRankingLoad(state);
    expect(state.refreshing).toBe(true);
    expect(state.botRows.length).toBeGreaterThan(0);
    state = applyRankingLoadResult(state, {
      kind: 'error',
      message: 'refresh failed',
      code: 'network_error',
    });
    expect(state.phase).toBe('populated');
    expect(state.botRows).toHaveLength(DEV_POPULATED_RANKING_ROWS.length);
    expect(state.errorMessage).toBe('refresh failed');
  });
});

describe('loadRankingFromPort', () => {
  it('preserves adapter order through loadRankingFromPort', async () => {
    const port: RankingReadPort = {
      list: async () => DEV_PRESERVE_ORDER_ROWS,
      listBotores: async () => [],
    };
    const result = await loadRankingFromPort(port);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok' && result.tab === 'bots') {
      expect(result.rows.map((r) => r.rank)).toEqual([7, 2, 99]);
    }
  });

  it('maps unavailable contract', async () => {
    const result = await loadRankingFromPort(new UnavailableContractRankingReadAdapter());
    expect(result.kind).toBe('unavailable_contract');
  });
});

describe('ranking accessibility + scroll contract', () => {
  it('labels ownership without inventing ranks', () => {
    const row: RankingRow = DEV_POPULATED_RANKING_ROWS[4]!;
    const label = rankingRowAccessibilityLabel(row);
    expect(label).toContain(`Rank ${row.rank}`);
    expect(label).toContain('your bot');
    expect(label).toContain(row.displayName);
  });

  it('overflow fixtures exceed a short viewport', () => {
    expect(
      rankingContentExceedsShortViewport(DEV_OVERFLOW_RANKING_ROWS.length, {
        viewportHeight: RANKING_SHORT_VIEWPORT_HEIGHT,
      }),
    ).toBe(true);
    expect(
      DEV_OVERFLOW_RANKING_ROWS.some((r) => r.displayName.toUpperCase().includes('WRAPS')),
    ).toBe(true);
  });

  it('keeps ScreenChrome scrolling enabled for overflow fixtures', () => {
    expect(RANKING_SCREEN_CHROME_SCROLL).toBe(true);
  });

  it('exports a chrome scroll owner flag RankingScreen must pass through', () => {
    // RankingScreen sets scroll={RANKING_SCREEN_CHROME_SCROLL} on ScreenChrome.
    expect(RANKING_SCREEN_CHROME_SCROLL).toBe(true);
  });
});

describe('ranking load controller generations', () => {
  it('ignores a slow first response after a second load wins', async () => {
    let resolveFirst!: (rows: readonly RankingRow[]) => void;
    let resolveSecond!: (rows: readonly RankingRow[]) => void;
    let calls = 0;
    const port: RankingReadPort = {
      list: async () => {
        calls += 1;
        if (calls === 1) {
          return await new Promise<readonly RankingRow[]>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return await new Promise<readonly RankingRow[]>((resolve) => {
          resolveSecond = resolve;
        });
      },
      listBotores: async () => [],
    };

    let session: RankingSessionState = createInitialRankingSession();
    const controller = createRankingLoadController(port, (updater) => {
      session = updater(session);
    });

    const first = controller.load();
    const second = controller.load();
    resolveSecond(DEV_POPULATED_RANKING_ROWS);
    await second;
    resolveFirst(DEV_PRESERVE_ORDER_ROWS);
    await first;
    expect(session.botRows.map((r) => r.botId)).toEqual(
      DEV_POPULATED_RANKING_ROWS.map((r) => r.botId),
    );
  });

  it('keeps prior rows when a later load succeeds after an earlier error', async () => {
    let resolveSecond!: (rows: readonly RankingRow[]) => void;
    let calls = 0;
    const port: RankingReadPort = {
      list: async () => {
        calls += 1;
        if (calls === 1) {
          return await new Promise<readonly RankingRow[]>((_, reject) => {
            setTimeout(() => reject(new Error('first failed')), 0);
          });
        }
        return await new Promise<readonly RankingRow[]>((resolve) => {
          resolveSecond = resolve;
        });
      },
      listBotores: async () => [],
    };

    let session: RankingSessionState = createInitialRankingSession();
    const controller = createRankingLoadController(port, (updater) => {
      session = updater(session);
    });

    const first = controller.load();
    await first;
    const second = controller.load();
    resolveSecond(DEV_POPULATED_RANKING_ROWS);
    await second;
    expect(session.phase).toBe('populated');
    expect(session.botRows).toHaveLength(DEV_POPULATED_RANKING_ROWS.length);
  });

  it('dispose prevents late resolves from writing', async () => {
    let resolveLate!: (rows: readonly RankingRow[]) => void;
    const port: RankingReadPort = {
      list: async () =>
        await new Promise<readonly RankingRow[]>((resolve) => {
          resolveLate = resolve;
        }),
      listBotores: async () => [],
    };

    let session: RankingSessionState = createInitialRankingSession();
    const controller = createRankingLoadController(port, (updater) => {
      session = updater(session);
    });

    void controller.load();
    controller.dispose();
    resolveLate(DEV_POPULATED_RANKING_ROWS);
    await Promise.resolve();
    expect(session.botRows).toHaveLength(0);
  });
});
