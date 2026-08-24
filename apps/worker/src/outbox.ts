/**
 * Outbox drain — transactional outbox consumer.
 *
 * Claims pending rows with FOR UPDATE SKIP LOCKED, hands each to the sink,
 * and marks them processed in the same transaction. Delivery is
 * at-least-once; sinks must be idempotent (event_id dedupe key).
 */
import type pg from 'pg';
import { validateAnalyticsEvent, NoopSink, type AnalyticsSink } from '@botore/analytics-events';

export interface DrainResult {
  claimed: number;
  delivered: number;
  failed: number;
}

export async function drainOutbox(pool: pg.Pool, sink: AnalyticsSink, batchSize = 50): Promise<DrainResult> {
  const client = await pool.connect();
  let delivered = 0;
  let failed = 0;
  try {
    await client.query('BEGIN');
    const claim = await client.query<{ event_id: string; event_name: string; schema_version: number; context: unknown; payload: unknown }>(
      `SELECT event_id, event_name, schema_version, context, payload
         FROM analytics_outbox
        WHERE processed_at IS NULL
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [batchSize],
    );

    for (const row of claim.rows) {
      try {
        const candidate = {
          eventId: row.event_id,
          name: row.event_name,
          source: 'server' as const,
          context: typeof row.context === 'string' ? JSON.parse(row.context) : row.context,
          payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
        };
        const event = validateAnalyticsEvent(candidate);
        await sink.emit(event);
        delivered += 1;
      } catch (err) {
        // Keep the row for inspection; count and continue.
        failed += 1;
        console.error('outbox delivery failed', row.event_id, err);
      }
    }

    if (delivered > 0) {
      await client.query(
        `UPDATE analytics_outbox SET processed_at = now()
          WHERE event_id = ANY($1::uuid[]) AND processed_at IS NULL`,
        [claim.rows.slice(0, delivered).map((r) => r.event_id)],
      );
    }
    await client.query('COMMIT');
    return { claimed: claim.rowCount ?? 0, delivered, failed };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

export const defaultSink: AnalyticsSink = new NoopSink();
