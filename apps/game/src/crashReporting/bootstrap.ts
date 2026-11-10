/**
 * Entry bootstrap that avoids loading `@sentry/react-native` unless reporting
 * is actually enabled. Design-capture / DEV builds stay free of native Sentry
 * startup cost (R3 cold-start).
 */

import type { ComponentType } from 'react';
import { isCrashReportingEnabled } from './policy';

export function bootstrapCrashReporting(Root: ComponentType<object>): ComponentType<object> {
  if (!isCrashReportingEnabled()) return Root;
  // Lazy require so Metro / Hermes do not evaluate Sentry until needed.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy load
  const sentryEntry = require('./initCrashReporting') as typeof import('./initCrashReporting');
  sentryEntry.initCrashReporting();
  return sentryEntry.wrapRootComponent(Root);
}
