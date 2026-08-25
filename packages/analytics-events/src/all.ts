/**
 * Public entry: typed analytics event catalog + validation + sinks.
 */
export {
  EVENT_CATALOG_VERSION,
  EventNameSchema,
  EventContextSchema,
  EventPayloadSchemas,
  validateAnalyticsEvent,
  AnalyticsValidationError,
} from './index.js';
export type { AnalyticsEvent, EventName, PrivacyClassification, EventContext } from './index.js';
export { NoopSink, ConsoleSink } from './sink.js';
export type { AnalyticsSink } from './sink.js';
