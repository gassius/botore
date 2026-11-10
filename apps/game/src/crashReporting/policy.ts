/**
 * R3 — crash reporting enablement for playable / production profiles.
 *
 * Local `pnpm start` (Metro `__DEV__`) stays off unless explicitly forced.
 * Preview / production EAS profiles bake `EXPO_PUBLIC_CRASH_REPORTING=1` and
 * a DSN; without a DSN the SDK never initializes (no cloud account required).
 *
 * Expo inlines only static `process.env.EXPO_PUBLIC_*` member expressions.
 */

import { isDevScaffoldAllowed } from '../runtime/devScaffoldPolicy';

function trimPublic(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truthyFlag(raw: string | undefined): boolean {
  const v = trimPublic(raw)?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function falsyFlag(raw: string | undefined): boolean {
  const v = trimPublic(raw)?.toLowerCase();
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

/** Public client DSN (safe to ship in the binary). Never put auth tokens here. */
export function readSentryDsn(
  dsn: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN,
): string | undefined {
  return trimPublic(dsn);
}

/**
 * Explicit enable / disable from EAS profile env.
 * - `1` / `true` → prefer on (still needs DSN)
 * - `0` / `false` → force off (DEV / design-review can disable)
 * - unset → infer from playable vs DEV scaffold policy
 */
export function readCrashReportingFlag(
  flag: string | undefined = process.env.EXPO_PUBLIC_CRASH_REPORTING,
): 'on' | 'off' | 'unset' {
  if (falsyFlag(flag)) return 'off';
  if (truthyFlag(flag)) return 'on';
  return 'unset';
}

/** Internal-only forced test error after init (never bake into store builds). */
export function isCrashReportingForceTestEnabled(
  flag: string | undefined = process.env.EXPO_PUBLIC_CRASH_REPORTING_FORCE_TEST,
): boolean {
  return truthyFlag(flag);
}

export type CrashReportingEnableOpts = {
  dsn?: string | undefined;
  crashReporting?: string | undefined;
  allowDevScaffold?: string | undefined;
  designCapture?: string | undefined;
  designCaptureFailClosed?: string | undefined;
  metroDev?: boolean;
};

/**
 * True when the Sentry SDK should initialize and send events.
 * Requires a DSN. DEV / design-capture / allow-dev-scaffold builds stay off
 * unless `EXPO_PUBLIC_CRASH_REPORTING=1` is set explicitly.
 */
export function isCrashReportingEnabled(opts?: CrashReportingEnableOpts): boolean {
  const dsn = readSentryDsn(opts?.dsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (!dsn) return false;

  const flag = readCrashReportingFlag(
    opts?.crashReporting ?? process.env.EXPO_PUBLIC_CRASH_REPORTING,
  );
  if (flag === 'off') return false;
  if (flag === 'on') return true;

  // Unset: enable only on playable fail-closed profiles (preview / production).
  const scaffoldOpts: Parameters<typeof isDevScaffoldAllowed>[0] = {};
  if (opts?.allowDevScaffold !== undefined) {
    scaffoldOpts.allowDevScaffold = opts.allowDevScaffold;
  }
  if (opts?.designCapture !== undefined) {
    scaffoldOpts.designCapture = opts.designCapture;
  }
  if (opts?.designCaptureFailClosed !== undefined) {
    scaffoldOpts.designCaptureFailClosed = opts.designCaptureFailClosed;
  }
  if (opts?.metroDev !== undefined) {
    scaffoldOpts.metroDev = opts.metroDev;
  }
  return !isDevScaffoldAllowed(scaffoldOpts);
}
