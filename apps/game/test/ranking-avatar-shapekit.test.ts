/**
 * Ranking avatars — ShapeKit head+paint per row (0041 portrait shapes).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_POPULATED_RANKING_ROWS } from '../src/ranking/fixtures/devRankingFixtures';

const gameRoot = process.cwd();

describe('ranking avatar ShapeKit (0041)', () => {
  it('migration 0041 projects head/body/arms/legs into list_bot_ranking portrait', () => {
    const sql = readFileSync(
      join(gameRoot, '../../supabase/migrations/0041_list_bot_ranking_shapes.sql'),
      'utf8',
    );
    expect(sql).toContain("'head', cl.loadout ->> 'head'");
    expect(sql).toContain("'body', cl.loadout ->> 'body'");
    expect(sql).toContain("'arms', cl.loadout ->> 'arms'");
    expect(sql).toContain("'legs', cl.loadout ->> 'legs'");
    expect(sql).toMatch(/create or replace function public\.list_bot_ranking/i);
  });

  it('RankingPortrait wires BotPortrait with shape loadout (not static helmet PNG)', () => {
    const src = readFileSync(join(gameRoot, 'src/ranking/RankingPortrait.tsx'), 'utf8');
    expect(src).toContain('BotPortrait');
    expect(src).toContain('head: portrait?.head');
    expect(src).not.toContain('head-oxide.png');
    expect(src).not.toContain('WORKSHOP_FRAME_PART_SOURCES');
  });

  it('RankingScreen passes full portrait parts into RankingPortrait', () => {
    const src = readFileSync(join(gameRoot, 'src/screens/RankingScreen.tsx'), 'utf8');
    expect(src).toMatch(/portrait=\{row\.portrait\}/);
  });

  it('adapter maps shape fields from list_bot_ranking', () => {
    const src = readFileSync(
      join(gameRoot, 'src/ranking/adapters/SupabaseRankingReadAdapter.ts'),
      'utf8',
    );
    expect(src).toMatch(/head:\s*typeof raw\.head/);
    expect(src).toMatch(/body:\s*typeof raw\.body/);
    expect(src).toMatch(/arms:\s*typeof raw\.arms/);
    expect(src).toMatch(/legs:\s*typeof raw\.legs/);
  });

  it('DEV fixtures include non-stock heads for capture distinctiveness', () => {
    const heads = new Set(DEV_POPULATED_RANKING_ROWS.map((r) => r.portrait?.head ?? null));
    expect(heads.has('head-welder')).toBe(true);
    expect(heads.has('head-can')).toBe(true);
    expect(heads.size).toBeGreaterThanOrEqual(2);
  });
});
