/**
 * Fastify HTTP API — vertical slice.
 *
 * Server-authoritative: clients submit intents (opponent id + idempotency
 * key); the server snapshots, seeds, simulates, persists, and awards.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { Value } from '@sinclair/typebox/value';
import { loadConfig } from '@botore/config';
import { createSha256Rng, seedToKeyMaterial } from '@botore/rng';
import { simulateBattle } from '@botore/combat-engine';
import {
  CreateBattleRequestSchema,
  OpponentListResponseSchema,
} from '@botore/contracts';
import { validateAnalyticsEvent, ConsoleSink, type AnalyticsEvent, type AnalyticsSink } from '@botore/analytics-events';
import { SEEDED_OPPONENTS, DEFAULT_PLAYER } from '@botore/test-fixtures';
import { getPool, closePool } from './db.js';
import { persistBattle, AllowanceExhaustedError, UnknownOpponentError } from './battle-transaction.js';
import { utcDay, allowancesRemaining } from './allowances.js';
import { createBattleSeed } from './seeds.js';

export interface BuildOptions {
  databaseUrl: string;
  serviceVersion?: string;
  port?: number;
  logger?: boolean;
}

export async function buildServer(opts: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const version = opts.serviceVersion ?? '0.1.0';
  const pool = getPool(opts.databaseUrl);
  // Local/no-cloud analytics sink; swap for PostHog adapter later (ADR-0006).
  const analytics: AnalyticsSink = new ConsoleSink();

  const devAccountId = '00000000-0000-4000-8000-000000000001';
  const devCharacterId = 'player-hero';

  // --- health ---------------------------------------------------------------
  app.get('/health', async () => ({ status: 'ok', service: 'api', version }));

  app.get('/ready', async () => {
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { ready: dbOk, checks: { database: dbOk } };
  });

  // --- opponents ------------------------------------------------------------
  app.get('/v1/opponents', async (_req, reply) => {
    const body = { opponents: SEEDED_OPPONENTS.map((o) => ({ ...o })) };
    if (!Value.Check(OpponentListResponseSchema, body)) {
      return reply.status(500).send({ error: 'opponent fixture drift' });
    }
    void emitSafe(analytics, {
      eventId: crypto.randomUUID(),
      name: 'opponent_list_viewed',
      source: 'server',
      context: { schemaVersion: 1, occurredAt: new Date().toISOString(), accountId: devAccountId },
      payload: { candidateCount: body.opponents.length },
    });
    return body;
  });

  // --- battles ----------------------------------------------------------------
  app.post('/v1/battles', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      return reply.status(400).send({ error: 'Idempotency-Key header required (8..128 chars)' });
    }
    if (!Value.Check(CreateBattleRequestSchema, req.body)) {
      return reply.status(400).send({ error: 'body must be { opponentId: string }' });
    }
    const { opponentId } = req.body as { opponentId: string };

    const opponent = SEEDED_OPPONENTS.find((o) => o.characterId === opponentId);
    if (!opponent) {
      return reply.status(404).send({ error: `unknown opponent ${opponentId}` });
    }

    // Server-side snapshot + seed + simulation.
    const attacker = { ...DEFAULT_PLAYER };
    const defender = { ...opponent };
    const seed = createBattleSeed();
    const rng = createSha256Rng(seedToKeyMaterial(seed));
    const replay = simulateBattle({
      battleId: 'pending',
      seed,
      attacker,
      defender,
      rng,
    });
    const won =
      replay.outcome.reason === 'defeat'
        ? replay.outcome.winner === attacker.characterId
        : replay.outcome.winnerByTiebreak === attacker.characterId;

    try {
      const result = await persistBattle(pool, {
        accountId: devAccountId,
        characterId: devCharacterId,
        idempotencyKey,
        opponentId,
        attacker,
        defender,
        replay: { ...replay, battleId: result_placeholder() },
        won,
        utcDay: utcDay(new Date()),
      });

      void emitSafe(analytics, {
        eventId: crypto.randomUUID(),
        name: 'xp_awarded',
        source: 'server',
        context: { schemaVersion: 1, occurredAt: new Date().toISOString(), accountId: devAccountId },
        payload: { battleId: result.battleId, amount: result.xpAwarded },
      });

      return reply.status(result.repeated ? 200 : 201).send({
        battleId: result.battleId,
        status: 'completed',
        outcome: { winner: result.winnerId, reason: result.reason },
        xpAwarded: result.xpAwarded,
        replayChecksum: result.replayChecksum,
      });
    } catch (err) {
      if (err instanceof AllowanceExhaustedError) {
        return reply.status(409).send({ error: err.message });
      }
      if (err instanceof UnknownOpponentError) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  function result_placeholder(): string {
    // The real battleId is generated inside the transaction; the replay's
    // battleId is rewritten there before storage via replayForStorage().
    return 'assigned-in-transaction';
  }

  // --- replay -----------------------------------------------------------------
  app.get('/v1/battles/:id/replay', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await pool.query<{ payload: unknown; checksum: string }>(
      `SELECT r.payload, r.checksum FROM battle_replays r WHERE r.battle_id = $1`,
      [id],
    );
    if (row.rowCount !== 1) {
      return reply.status(404).send({ error: 'replay not found' });
    }
    const data = row.rows[0] as { payload: unknown; checksum: string };
    return { battleId: id, replay: data.payload, checksum: data.checksum };
  });

  // --- allowances (read-only helper for the slice) -----------------------------
  app.get('/v1/allowances', async () => {
    const day = utcDay(new Date());
    const used = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM fight_allowances
        WHERE account_id = $1 AND utc_day = $2 AND used_at IS NOT NULL`,
      [devAccountId, day],
    );
    const usedToday = Number.parseInt(used.rows[0]?.n ?? '0', 10);
    return { utcDay: day, usedToday, remaining: allowancesRemaining(usedToday), dailyTotal: 3 };
  });

  // --- graceful shutdown -------------------------------------------------------
  app.addHook('onClose', async () => {
    await closePool();
  });

  return app;
}

/** Analytics failures are logged, never fatal. */
async function emitSafe(sink: AnalyticsSink, event: unknown): Promise<void> {
  try {
    const validated = validateAnalyticsEvent(event) as AnalyticsEvent;
    await sink.emit(validated);
  } catch (err) {
    console.error('analytics emit failed', err);
  }
}

// entrypoint when run directly
const isMain = process.argv[1]?.includes('server');
if (isMain) {
  const cfg = loadConfig(process.env as Record<string, string | undefined>);
  buildServer({ databaseUrl: cfg.databaseUrl, serviceVersion: cfg.serviceVersion })
    .then(async (app) => {
      await app.listen({ port: cfg.port, host: '127.0.0.1' });
      console.log(`api listening on 127.0.0.1:${cfg.port}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
