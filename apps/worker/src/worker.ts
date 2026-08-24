/**
 * Worker entrypoint: health endpoint (Fastify, per architecture) + periodic
 * outbox drain. The worker never writes gameplay tables — it only marks
 * analytics outbox rows as processed.
 */
import Fastify from 'fastify';
import pg from 'pg';
import { loadConfig } from '@botore/config';
import { ConsoleSink } from '@botore/analytics-events';
import { drainOutbox, defaultSink, type DrainResult } from './outbox.js';

const cfg = loadConfig(process.env as Record<string, string | undefined>);
const healthPort = (cfg.port ?? 8080) + 1;

const pool = new pg.Pool({ connectionString: cfg.databaseUrl });
const sink = cfg.environment === 'development' ? new ConsoleSink() : defaultSink;

const app = Fastify({ logger: false });

app.get('/health', async () => ({ status: 'ok', service: 'worker', version: cfg.serviceVersion }));

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

app.get('/drain', async () => {
  const result: DrainResult = await drainOutbox(pool, sink);
  return result;
});

async function tick(): Promise<void> {
  try {
    const r = await drainOutbox(pool, sink);
    if (r.claimed > 0) console.log('outbox drain', r);
  } catch (err) {
    console.error('drain tick failed', err);
  }
}

const interval = setInterval(tick, 5_000);
interval.unref();

app
  .listen({ port: Number(process.env['WORKER_HEALTH_PORT'] ?? healthPort), host: '127.0.0.1' })
  .then(() => console.log(`worker health on 127.0.0.1:${healthPort}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
