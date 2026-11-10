/**
 * Sentry init for native release / playable builds (R3).
 * Kept behind {@link isCrashReportingEnabled} so local Metro never needs a
 * cloud analytics / crash account.
 */

import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';
import { isCrashReportingEnabled, isCrashReportingForceTestEnabled, readSentryDsn } from './policy';
import { scrubCrashEvent } from './scrub';

export const FORCED_CRASH_TEST_MESSAGE = 'BotoreForcedCrashReportingTest';

let initialized = false;

/** Test / diagnostics — whether {@link initCrashReporting} ran Sentry.init. */
export function isCrashReportingInitialized(): boolean {
  return initialized;
}

/** Reset init latch (unit tests only). */
export function resetCrashReportingInitForTests(): void {
  initialized = false;
}

/**
 * Initialize Sentry when enabled. Safe no-op without DSN / when DEV-disabled.
 * Call once at process entry before registering the root component.
 */
export function initCrashReporting(): boolean {
  if (initialized) return true;
  if (!isCrashReportingEnabled()) return false;

  const dsn = readSentryDsn();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    enabled: true,
    // Crash reporting only — not an analytics / APM product.
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: false,
    attachStacktrace: true,
    beforeSend(event) {
      return scrubCrashEvent(event);
    },
  });

  initialized = true;

  if (isCrashReportingForceTestEnabled()) {
    // JS path — proves source maps / symbolication once credentials exist.
    Sentry.captureException(new Error(FORCED_CRASH_TEST_MESSAGE));
  }

  return true;
}

/**
 * Wrap the root component when reporting is active so ErrorBoundary captures
 * React render failures. Identity when disabled.
 */
export function wrapRootComponent(Root: ComponentType<object>): ComponentType<object> {
  if (!isCrashReportingEnabled()) return Root;
  // Sentry.wrap expects a loose props bag; App has no required props.
  return Sentry.wrap(Root as ComponentType<Record<string, unknown>>) as ComponentType<object>;
}

/**
 * Documented forced error path for internal / preview verification builds.
 * Prefer `EXPO_PUBLIC_CRASH_REPORTING_FORCE_TEST=1` at boot; call this
 * from a hidden QA control when needed.
 *
 * When `native` is true, triggers the native hard-crash helper (release builds
 * only — no-ops / may warn under Expo Go).
 */
export function forceCrashReportingTestError(opts?: { native?: boolean }): void {
  if (!initialized && !initCrashReporting()) {
    throw new Error(
      'forceCrashReportingTestError: crash reporting is disabled (missing DSN or DEV policy)',
    );
  }
  if (opts?.native) {
    Sentry.nativeCrash();
    return;
  }
  Sentry.captureException(new Error(FORCED_CRASH_TEST_MESSAGE));
}
