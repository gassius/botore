import type { BotoreRankingRow, RankingRow } from '../types';

/**
 * DEV-only ranking fixtures (D4 mockup-shaped names + paints).
 *
 * Names and ranks are illustrative scaffolding data — not live players and
 * not product ranking rules. Never surface as "PILOT" for every row.
 */
export const DEV_RANKING_FIXTURE_LABEL = 'DEV' as const;

const portrait = (
  paint: string,
  weapon = 'weapon-sword',
  shapes?: { head?: string; body?: string; arms?: string; legs?: string },
): RankingRow['portrait'] => ({
  chassis: 'chassis-basic',
  paint,
  weapon,
  head: shapes?.head ?? 'head-visor',
  body: shapes?.body ?? 'body-chassis',
  arms: shapes?.arms ?? 'arms-stock',
  legs: shapes?.legs ?? 'legs-stock',
  atlasVersion: 'v1',
});

/** Populated bot board in a fixed fixture order. Do not sort for “fairness”. */
export const DEV_POPULATED_RANKING_ROWS: readonly RankingRow[] = Object.freeze([
  {
    rank: 1,
    botId: 'dev-bot-sir',
    displayName: 'Sir Bot',
    botoreName: 'Magistra Volta',
    botoreId: 'dev-botore-volta',
    wins: 18,
    losses: 2,
    totalXp: 980,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-cobalt'),
  },
  {
    rank: 2,
    botId: 'dev-bot-grundig',
    displayName: 'Grundig',
    botoreName: 'Tito Rivet',
    botoreId: 'dev-botore-rivet',
    wins: 16,
    losses: 4,
    totalXp: 870,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-crimson', 'weapon-axe', {
      head: 'head-welder',
      body: 'body-boiler',
      arms: 'arms-heavy',
      legs: 'legs-piston',
    }),
  },
  {
    rank: 3,
    botId: 'dev-bot-torque',
    displayName: 'Lady Torque',
    botoreName: 'Magistra Volta',
    botoreId: 'dev-botore-volta',
    wins: 15,
    losses: 5,
    totalXp: 812,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-cobalt', 'weapon-dagger', { head: 'head-can' }),
  },
  {
    rank: 4,
    botId: 'dev-bot-mule',
    displayName: 'Bronze Mule',
    botoreName: 'Doctore Ferro',
    botoreId: 'dev-botore-ferro',
    wins: 13,
    losses: 6,
    totalXp: 705,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-crimson'),
  },
  {
    rank: 5,
    botId: 'dev-bot-chispa',
    displayName: 'Chispa',
    botoreName: 'Carlos',
    botoreId: 'dev-botore-you',
    wins: 12,
    losses: 6,
    totalXp: 664,
    isCurrentBot: true,
    source: 'dev-fixture',
    portrait: portrait('paint-crimson', 'weapon-sword', { head: 'head-welder' }),
  },
  {
    rank: 6,
    botId: 'dev-bot-perno',
    displayName: 'Perno',
    botoreName: 'Cassia Gear',
    botoreId: 'dev-botore-gear',
    wins: 10,
    losses: 7,
    totalXp: 590,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-cobalt'),
  },
]);

export const DEV_EMPTY_RANKING_ROWS: readonly RankingRow[] = Object.freeze([]);

/** Deliberately odd ranks to prove the UI preserves adapter order, not client ranking. */
export const DEV_PRESERVE_ORDER_ROWS: readonly RankingRow[] = Object.freeze([
  {
    rank: 7,
    botId: 'dev-bot-seventh',
    displayName: 'Seventh',
    botoreName: 'Order Check',
    botoreId: 'dev-botore-order',
    wins: 1,
    losses: 0,
    totalXp: 2,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-crimson'),
  },
  {
    rank: 2,
    botId: 'dev-bot-second',
    displayName: 'Second',
    botoreName: 'Order Check',
    botoreId: 'dev-botore-order',
    wins: 3,
    losses: 1,
    totalXp: 7,
    isCurrentBot: true,
    source: 'dev-fixture',
    portrait: portrait('paint-cobalt'),
  },
  {
    rank: 99,
    botId: 'dev-bot-ninetynine',
    displayName: 'Ninety-Nine',
    botoreName: 'Order Check',
    botoreId: 'dev-botore-order',
    wins: 0,
    losses: 2,
    totalXp: 1,
    isCurrentBot: false,
    source: 'dev-fixture',
    portrait: portrait('paint-crimson'),
  },
]);

/**
 * Many rows for scroll/overflow regression evidence.
 * Order is fixture order only — not a ranking algorithm.
 */
export const DEV_OVERFLOW_RANKING_ROWS: readonly RankingRow[] = Object.freeze(
  Array.from({ length: 16 }, (_, index) => {
    const rank = index + 1;
    return {
      rank,
      botId: `dev-bot-overflow-${rank}`,
      displayName:
        rank === 5 ? 'Very Long Overflow Name That Wraps On Narrow Layouts' : `Bot ${rank}`,
      botoreName: 'Overflow Yard',
      botoreId: 'dev-botore-overflow',
      wins: Math.max(0, 16 - rank),
      losses: rank,
      totalXp: Math.max(0, 900 - rank * 40),
      isCurrentBot: rank === 8,
      source: 'dev-fixture' as const,
      portrait: portrait(rank % 2 === 0 ? 'paint-crimson' : 'paint-cobalt'),
    };
  }),
);

/** Populated botore board matching bot fixture owners. */
export const DEV_POPULATED_BOTORE_ROWS: readonly BotoreRankingRow[] = Object.freeze([
  {
    rank: 1,
    botoreId: 'dev-botore-volta',
    name: 'Magistra Volta',
    emblemId: 'emblem-volta',
    wins: 41,
    losses: 12,
    botsOwned: 3,
    botPaints: ['paint-cobalt', 'paint-cobalt', 'paint-crimson'],
    isCurrentBotore: false,
    source: 'dev-fixture',
  },
  {
    rank: 2,
    botoreId: 'dev-botore-ferro',
    name: 'Doctore Ferro',
    emblemId: 'emblem-ferro',
    wins: 21,
    losses: 14,
    botsOwned: 2,
    botPaints: ['paint-crimson', 'paint-cobalt'],
    isCurrentBotore: false,
    source: 'dev-fixture',
  },
  {
    rank: 3,
    botoreId: 'dev-botore-gear',
    name: 'Cassia Gear',
    emblemId: 'emblem-gear',
    wins: 16,
    losses: 16,
    botsOwned: 2,
    botPaints: ['paint-cobalt', 'paint-crimson'],
    isCurrentBotore: false,
    source: 'dev-fixture',
  },
  {
    rank: 4,
    botoreId: 'dev-botore-rivet',
    name: 'Tito Rivet',
    emblemId: 'emblem-rivet',
    wins: 16,
    losses: 4,
    botsOwned: 1,
    botPaints: ['paint-crimson'],
    isCurrentBotore: false,
    source: 'dev-fixture',
  },
  {
    rank: 5,
    botoreId: 'dev-botore-you',
    name: 'Carlos',
    emblemId: 'emblem-you',
    wins: 12,
    losses: 6,
    botsOwned: 1,
    botPaints: ['paint-crimson'],
    isCurrentBotore: true,
    source: 'dev-fixture',
  },
]);

export const DEV_EMPTY_BOTORE_ROWS: readonly BotoreRankingRow[] = Object.freeze([]);
