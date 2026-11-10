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
      expect(row.displayName.startsWith('DEV')).toBe(true);
    }
  });

  it('marks current-bot ownership with an explicit flag (not paint)', () => {
    const current = DEV_POPULATED_RANKING_ROWS.filter((r) => r.isCurrentBot);
    expect(current).toHaveLength(1);
    expect(current[0]?.botId).toBe('dev-bot-rivet');
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
      rows: DEV_POPULATED_RANKING_ROWS,
    });
    expect(populated.phase).toBe('populated');
    expect(populated.rows).toHaveLength(DEV_POPULATED_RANKING_ROWS.length);

    const empty = applyRankingLoadResult(base, { kind: 'ok', rows: [] });
    expect(empty.phase).toBe('empty');

    const errored = applyRankingLoadResult(base, {
      kind: 'error',
      message: 'network',
    });
    expect(errored.phase).toBe('error');
    expect(errored.rows).toHaveLength(0);

    const blocked = applyRankingLoadResult(base, {
      kind: 'unavailable_contract',
      message: 'no contract',
    });
    expect(blocked.phase).toBe('unavailable_contract');
  });

  it('keeps prior readable rows coherent through refresh failure', () => {
    let state = applyRankingLoadResult(createInitialRankingSession(), {
      kind: 'ok',
      rows: DEV_POPULATED_RANKING_ROWS,
    });
    state = beginRankingLoad(state);
    expect(state.refreshing).toBe(true);
    expect(state.phase).toBe('populated');
    expect(state.rows).toHaveLength(DEV_POPULATED_RANKING_ROWS.length);

    state = applyRankingLoadResult(state, {
      kind: 'error',
      message: 'refresh failed',
    });
    expect(state.phase).toBe('populated');
    expect(state.rows).toEqual(DEV_POPULATED_RANKING_ROWS);
    expect(state.errorMessage).toBe('refresh failed');
    expect(state.refreshing).toBe(false);
  });

  it('preserves adapter order through loadRankingFromPort', async () => {
    const port: RankingReadPort = {
      list: async () => DEV_PRESERVE_ORDER_ROWS,
    };
    const result = await loadRankingFromPort(port);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.rows.map((r) => r.rank)).toEqual([7, 2, 99]);
    }
  });

  it('maps contract errors from the port', async () => {
    const result = await loadRankingFromPort(new UnavailableContractRankingReadAdapter());
    expect(result.kind).toBe('unavailable_contract');
  });

  it('builds accessibility labels with ownership and DEV source', () => {
    const row: RankingRow = DEV_POPULATED_RANKING_ROWS[2]!;
    const label = rankingRowAccessibilityLabel(row);
    expect(label).toContain('Rank 3');
    expect(label).toContain('your bot');
    expect(label).toContain('development fixture');
  });
});

describe('no client ranking algorithm', () => {
  it('does not sort ranks ascending when applying results', () => {
    const shuffled = DEV_PRESERVE_ORDER_ROWS;
    const state = applyRankingLoadResult(createInitialRankingSession(), {
      kind: 'ok',
      rows: shuffled,
    });
    expect(state.rows.map((r) => r.rank)).toEqual([7, 2, 99]);
  });
});

describe('ranking scroll owner (PRR blocker)', () => {
  it('keeps ScreenChrome scrolling enabled for overflow fixtures', () => {
    expect(RANKING_SCREEN_CHROME_SCROLL).toBe(true);
    expect(rankingContentExceedsShortViewport(DEV_OVERFLOW_RANKING_ROWS.length)).toBe(true);
    expect(
      rankingContentExceedsShortViewport(DEV_OVERFLOW_RANKING_ROWS.length, {
        viewportHeight: RANKING_SHORT_VIEWPORT_HEIGHT,
      }),
    ).toBe(true);
    // Long wrap name fixture still present in the overflow set.
    expect(DEV_OVERFLOW_RANKING_ROWS.some((r) => r.displayName.includes('WRAPS'))).toBe(true);
  });

  it('exports a chrome scroll owner flag RankingScreen must pass through', () => {
    // RankingScreen sets scroll={RANKING_SCREEN_CHROME_SCROLL} on ScreenChrome.
    // Keeping the flag true is the regression gate against scroll={false}.
    expect(RANKING_SCREEN_CHROME_SCROLL).toBe(true);
  });
});

describe('ranking load controller coalescing', () => {
  it('ignores a slower first response after a newer load completes', async () => {
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
    };

    let session: RankingSessionState = createInitialRankingSession();
    const controller = createRankingLoadController(port, (updater) => {
      session = updater(session);
    });

    const first = controller.load();
    const second = controller.load();
    expect(controller.getGeneration()).toBe(2);

    // Newer request completes first with a distinct DEV list.
    resolveSecond(DEV_PRESERVE_ORDER_ROWS);
    await second;
    expect(session.phase).toBe('populated');
    expect(session.rows.map((r) => r.botId)).toEqual([
      'dev-bot-seventh',
      'dev-bot-second',
      'dev-bot-ninetynine',
    ]);

    // Stale first response must not overwrite the newer rows.
    resolveFirst(DEV_POPULATED_RANKING_ROWS);
    await first;
    expect(session.rows.map((r) => r.botId)).toEqual([
      'dev-bot-seventh',
      'dev-bot-second',
      'dev-bot-ninetynine',
    ]);
    expect(session.errorMessage).toBeNull();
  });

  it('ignores a slower first failure after a newer success', async () => {
    let rejectFirst!: (err: Error) => void;
    let resolveSecond!: (rows: readonly RankingRow[]) => void;
    let calls = 0;
    const port: RankingReadPort = {
      list: async () => {
        calls += 1;
        if (calls === 1) {
          return await new Promise<readonly RankingRow[]>((_, reject) => {
            rejectFirst = reject;
          });
        }
        return await new Promise<readonly RankingRow[]>((resolve) => {
          resolveSecond = resolve;
        });
      },
    };

    let session: RankingSessionState = createInitialRankingSession();
    const controller = createRankingLoadController(port, (updater) => {
      session = updater(session);
    });

    const first = controller.load();
    const second = controller.load();

    resolveSecond(DEV_POPULATED_RANKING_ROWS);
    await second;
    expect(session.phase).toBe('populated');
    expect(session.errorMessage).toBeNull();

    rejectFirst(new Error('stale failure'));
    await first.catch(() => undefined);
    // Give the controller's ignored path a tick.
    await Promise.resolve();
    expect(session.phase).toBe('populated');
    expect(session.errorMessage).toBeNull();
    expect(session.rows).toHaveLength(DEV_POPULATED_RANKING_ROWS.length);
  });

  it('dispose ignores a late resolve from a superseded controller', async () => {
    let resolveLate!: (rows: readonly RankingRow[]) => void;
    const port: RankingReadPort = {
      list: async () =>
        await new Promise<readonly RankingRow[]>((resolve) => {
          resolveLate = resolve;
        }),
    };

    let session: RankingSessionState = createInitialRankingSession();
    const controller = createRankingLoadController(port, (updater) => {
      session = updater(session);
    });

    const pending = controller.load();
    expect(session.phase).toBe('loading');
    controller.dispose();

    resolveLate(DEV_POPULATED_RANKING_ROWS);
    await pending;
    await Promise.resolve();
    // Disposed controller must not apply rows (RankingScreen recreates on port change).
    expect(session.phase).toBe('loading');
    expect(session.rows).toHaveLength(0);
  });
});
