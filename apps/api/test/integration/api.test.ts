/**
 * API happy-path integration against reset local Supabase.
 * Requires: pnpm db:reset && DATABASE_URL set. Skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { Pool as PgPool } from 'pg';
import { buildServer } from '../../src/server.js';

const DATABASE_URL = process.env['DATABASE_URL'];
const d = DATABASE_URL ? describe : describe.skip;

let app: FastifyInstance;
let adminPool: pg.Pool;

async function resetData(): Promise<void> {
  // Reset the mutable slice data but keep seeds/structure from migrations.
  await adminPool.query(`
    TRUNCATE battle_commands, battle_replays, battle_participants, battles,
             progression_ledger, analytics_outbox;
    UPDATE fight_allowances SET used_at = NULL;
  `);
}

d('api integration (local supabase)', () => {
  beforeAll(async () => {
    adminPool = new PgPool({ connectionString: DATABASE_URL });
    await resetData();
    app = await buildServer({ databaseUrl: DATABASE_URL as string });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await adminPool.end();
  });

  it('health and readiness respond', async () => {
    const h = await app.inject({ method: 'GET', url: '/health' });
    expect(h.statusCode).toBe(200);
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.json()).toMatchObject({ ready: true, checks: { database: true } });
  });

  it('serves exactly three opponents', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/opponents' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { opponents: Array<{ characterId: string }> };
    expect(body.opponents).toHaveLength(3);
  });

  it('full battle flow: request → persist → replay → xp, then idempotent replay of command', async () => {
    const post = await app.inject({
      method: 'POST',
      url: '/v1/battles',
      headers: { 'idempotency-key': 'itest-key-0001' },
      payload: { opponentId: 'opp-sir-bot' },
    });
    expect([200, 201]).toContain(post.statusCode);
    const first = post.json() as { battleId: string; xpAwarded: number };
    expect(first.xpAwarded).toBeGreaterThanOrEqual(1);

    // replay endpoint returns canonical replay
    const rep = await app.inject({ method: 'GET', url: `/v1/battles/${first.battleId}/replay` });
    expect(rep.statusCode).toBe(200);
    const replayBody = rep.json() as { replay: { events: unknown[]; seed: string } };
    expect(replayBody.replay.events.length).toBeGreaterThan(0);

    // allowance consumed once
    const al = await app.inject({ method: 'GET', url: '/v1/allowances' });
    const allowances = al.json() as { usedToday: number; remaining: number };
    expect(allowances.usedToday).toBe(1);
    expect(allowances.remaining).toBe(2);

    // same idempotency key → same result, no double consumption/award
    const again = await app.inject({
      method: 'POST',
      url: '/v1/battles',
      headers: { 'idempotency-key': 'itest-key-0001' },
      payload: { opponentId: 'opp-sir-bot' },
    });
    expect(again.statusCode).toBe(200);
    const second = again.json() as { battleId: string; xpAwarded: number; repeated?: boolean };
    expect(second.battleId).toBe(first.battleId);
    expect(second.xpAwarded).toBe(first.xpAwarded);

    const al2 = await app.inject({ method: 'GET', url: '/v1/allowances' });
    expect((al2.json() as { usedToday: number }).usedToday).toBe(1);

    // ledger has exactly one entry for this battle
    const ledger = await adminPool.query(
      `SELECT count(*)::int AS n FROM progression_ledger WHERE battle_id = $1`,
      [first.battleId],
    );
    expect(ledger.rows[0]?.n).toBe(1);
  });

  it('rejects a fourth battle in the day (allowance exhausted)', async () => {
    // use up remaining two
    for (const key of ['itest-key-0002', 'itest-key-0003']) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/battles',
        headers: { 'idempotency-key': key },
        payload: { opponentId: 'opp-dex-bot' },
      });
      expect([200, 201]).toContain(r.statusCode);
    }
    const fourth = await app.inject({
      method: 'POST',
      url: '/v1/battles',
      headers: { 'idempotency-key': 'itest-key-0004' },
      payload: { opponentId: 'opp-hp-bot' },
    });
    expect(fourth.statusCode).toBe(409);
  });

  it('defender participation never consumes defender allowance or awards them XP', async () => {
    // Opponents are not accounts; verify no ledger rows reference opponent ids.
    const rows = await adminPool.query(
      `SELECT count(*)::int AS n FROM progression_ledger pl
         JOIN characters c ON c.character_id = pl.character_id
        WHERE c.is_opponent = true`,
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('missing or short idempotency key is rejected', async () => {
    const noKey = await app.inject({
      method: 'POST',
      url: '/v1/battles',
      payload: { opponentId: 'opp-sir-bot' },
    });
    expect(noKey.statusCode).toBe(400);
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/battles',
      headers: { 'idempotency-key': 'short' },
      payload: { opponentId: 'opp-sir-bot' },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('malformed payloads fail validation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/battles',
      headers: { 'idempotency-key': 'itest-key-val' },
      payload: { wrong: 'shape' },
    });
    expect(res.statusCode).toBe(400);
  });
});
