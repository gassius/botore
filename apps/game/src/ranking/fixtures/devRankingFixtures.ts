import type { RankingRow } from '../types';

/**
 * DEV-only ranking fixtures.
 *
 * Names and ranks are illustrative scaffolding data — not live players and
 * not product ranking rules (REF-03 sample order must not become rules).
 */
export const DEV_RANKING_FIXTURE_LABEL = 'DEV' as const;

/** Populated list in a fixed fixture order. Do not sort this array for “fairness”. */
export const DEV_POPULATED_RANKING_ROWS: readonly RankingRow[] = Object.freeze([
  {
    rank: 1,
    botId: 'dev-bot-bolt',
    displayName: 'DEV · BOLT',
    isCurrentBot: false,
    source: 'dev-fixture',
  },
  {
    rank: 2,
    botId: 'dev-bot-clank',
    displayName: 'DEV · CLANK',
    isCurrentBot: false,
    source: 'dev-fixture',
  },
  {
    rank: 3,
    botId: 'dev-bot-rivet',
    displayName: 'DEV · RIVET',
    isCurrentBot: true,
    source: 'dev-fixture',
  },
  {
    rank: 4,
    botId: 'dev-bot-long-name',
    displayName: 'DEV · VERY LONG BOT NAME THAT WRAPS',
    isCurrentBot: false,
    source: 'dev-fixture',
  },
]);

export const DEV_EMPTY_RANKING_ROWS: readonly RankingRow[] = Object.freeze([]);

/** Deliberately odd ranks to prove the UI preserves adapter order, not client ranking. */
export const DEV_PRESERVE_ORDER_ROWS: readonly RankingRow[] = Object.freeze([
  {
    rank: 7,
    botId: 'dev-bot-seventh',
    displayName: 'DEV · SEVENTH',
    isCurrentBot: false,
    source: 'dev-fixture',
  },
  {
    rank: 2,
    botId: 'dev-bot-second',
    displayName: 'DEV · SECOND',
    isCurrentBot: true,
    source: 'dev-fixture',
  },
  {
    rank: 99,
    botId: 'dev-bot-ninetynine',
    displayName: 'DEV · NINETY-NINE',
    isCurrentBot: false,
    source: 'dev-fixture',
  },
]);
