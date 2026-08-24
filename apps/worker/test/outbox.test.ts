import { describe, it, expect } from 'vitest';
import { NoopSink, validateAnalyticsEvent, EVENT_CATALOG_VERSION } from '@botore/analytics-events';
import { defaultSink } from '../src/outbox.js';

/**
 * Outbox drain logic is DB-backed; without a database we verify the module
 * contract via its exported sink default and validation integration.
 * Full drain coverage runs in the database tests (supabase/tests).
 */
describe('outbox module', () => {
  it('exposes a non-throwing default sink', () => {
    expect(defaultSink.name).toBe('noop');
    expect(() =>
      defaultSink.emit(
        validateAnalyticsEvent({
          eventId: 'e1',
          name: 'xp_awarded',
          source: 'server',
          context: { schemaVersion: EVENT_CATALOG_VERSION, occurredAt: '2026-08-24T00:00:00Z' },
          payload: { battleId: 'b', amount: 2 },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects invalid outbox rows through the shared validator', () => {
    expect(() =>
      validateAnalyticsEvent({ eventId: 'e2', name: 'nope', source: 'server' }),
    ).toThrow();
    void NoopSink;
  });
});
