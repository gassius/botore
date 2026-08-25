/**
 * Analytics sink interface + no-op/local implementations.
 *
 * The platform never requires a cloud analytics account: production adapters
 * (e.g. PostHog) implement `AnalyticsSink`; local development uses the
 * console sink. Sinks receive already-validated events and MUST NOT throw —
 * analytics failures are logged, never fatal to gameplay.
 */
import { type AnalyticsEvent } from './index.js';

export interface AnalyticsSink {
  readonly name: string;
  emit(event: AnalyticsEvent): void | Promise<void>;
}

/** Discards events. Default in tests. */
export class NoopSink implements AnalyticsSink {
  readonly name = 'noop';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  emit(_event: AnalyticsEvent): void {
    /* intentionally discards */
  }
}

/**
 * Local development sink: writes a compact JSON line to stdout.
 * Never logs payloads classified as sensitive (redacts them).
 */
export class ConsoleSink implements AnalyticsSink {
  readonly name = 'console';
  constructor(private readonly write: (line: string) => void = (l) => console.log(l)) {}

  emit(event: AnalyticsEvent): void {
    const safe =
      event.classification === 'sensitive' ? { ...event, payload: { redacted: true } } : event;
    this.write(JSON.stringify(safe));
  }
}
