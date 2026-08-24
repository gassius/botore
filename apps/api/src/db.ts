/**
 * PostgreSQL pool access for the API's server credential.
 *
 * PROVIDER ADAPTER — the only place in apps/api that knows about pg.
 * Domain/engine code never imports this module.
 */
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(databaseUrl: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Runs `fn` inside a transaction; rolls back on throw. */
export async function withTransaction<T>(
  client: pg.PoolClient,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
