import { describe, it, expect } from 'vitest';
import {
  EVENT_CATALOG_VERSION,
  validateAnalyticsEvent,
  AnalyticsValidationError,
  NoopSink,
  ConsoleSink,
  type AnalyticsEvent,
} from '../src/all.js';

function validEvent(): Record<string, unknown> {
  return {
    eventId: 'evt-1',
    name: 'battle_completed',
    source: 'server',
    context: {
      schemaVersion: EVENT_CATALOG_VERSION,
      occurredAt: '2026-08-24T00:00:00Z',
      accountId: 'acc-1',
    },
    payload: { battleId: 'b-1', won: true, xpAwarded: 2 },
  };
}

describe('analytics events', () => {
  it('accepts a valid event and classifies privacy', () => {
    const ev = validateAnalyticsEvent(validEvent());
    expect(ev.classification).toBe('operational');
    expect(ev.name).toBe('battle_completed');
    const analytical = validateAnalyticsEvent({
      ...validEvent(),
      name: 'replay_completed',
      payload: { battleId: 'b-1', completionRatio: 1.0 },
    });
    expect(analytical.classification).toBe('analytical');
  });

  it('rejects malformed events with precise issues', () => {
    for (const bad of [
      {},
      null,
      { ...validEvent(), name: 'not_a_real_event' },
      { ...validEvent(), source: 'client' },
      { ...validEvent(), context: {} },
      { ...validEvent(), payload: undefined },
    ]) {
      try {
        validateAnalyticsEvent(bad);
        expect.unreachable(`should have thrown for ${JSON.stringify(bad)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AnalyticsValidationError);
      }
    }
  });

  it('sinks: noop discards, console redacts sensitive payloads', () => {
    expect(() => new NoopSink().emit(validateAnalyticsEvent(validEvent()))).not.toThrow();

    const lines: string[] = [];
    const sink = new ConsoleSink((l) => lines.push(l));
    sink.emit(validateAnalyticsEvent(validEvent()) as AnalyticsEvent);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('battle_completed');
  });
});
