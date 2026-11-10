import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isCrashReportingEnabled,
  isCrashReportingForceTestEnabled,
  readCrashReportingFlag,
  readSentryDsn,
} from '../src/crashReporting/policy';
import { scrubCrashEvent, scrubRecord } from '../src/crashReporting/scrub';

const policySourcePath = join(process.cwd(), 'src/crashReporting/policy.ts');
const initSourcePath = join(process.cwd(), 'src/crashReporting/initCrashReporting.ts');
const indexSourcePath = join(process.cwd(), 'index.js');
const metroSourcePath = join(process.cwd(), 'metro.config.js');
const easSourcePath = join(process.cwd(), 'eas.json');

describe('R3 crash reporting policy', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_CRASH_REPORTING;
    delete process.env.EXPO_PUBLIC_CRASH_REPORTING_FORCE_TEST;
    delete process.env.EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD;
    delete process.env.EXPO_PUBLIC_DESIGN_CAPTURE;
    delete process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED;
  });

  it('keeps Expo public env reads as static process.env member expressions', () => {
    const source = readFileSync(policySourcePath, 'utf8');
    expect(source).toContain('process.env.EXPO_PUBLIC_SENTRY_DSN');
    expect(source).toContain('process.env.EXPO_PUBLIC_CRASH_REPORTING');
    expect(source).toContain('process.env.EXPO_PUBLIC_CRASH_REPORTING_FORCE_TEST');
    expect(source).not.toMatch(/process\?\.env/);
    expect(source).not.toMatch(/env\[name\]/);
  });

  it('wires entry + Metro Sentry serializer without requiring local DSN', () => {
    const index = readFileSync(indexSourcePath, 'utf8');
    const metro = readFileSync(metroSourcePath, 'utf8');
    expect(index).toContain('bootstrapCrashReporting');
    expect(metro).toContain('getSentryExpoConfig');
    expect(metro).toContain('m4a');
  });

  it('disables reporter on DEV / design-review EAS profiles', () => {
    const eas = JSON.parse(readFileSync(easSourcePath, 'utf8')) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    expect(eas.build['design-review']?.env?.EXPO_PUBLIC_CRASH_REPORTING).toBe('0');
    expect(eas.build.development?.env?.EXPO_PUBLIC_CRASH_REPORTING).toBe('0');
    expect(eas.build.preview?.env?.EXPO_PUBLIC_CRASH_REPORTING).toBe('1');
    expect(eas.build.production?.env?.EXPO_PUBLIC_CRASH_REPORTING).toBe('1');
  });

  it('disables Sentry auto-upload by default so CI builds without secrets succeed', () => {
    const eas = JSON.parse(readFileSync(easSourcePath, 'utf8')) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    for (const profile of ['design-review', 'development', 'preview', 'production'] as const) {
      expect(eas.build[profile]?.env?.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
    }
    const lib = readFileSync(join(process.cwd(), '../../scripts/native-capture/lib.sh'), 'utf8');
    expect(lib).toContain('export_sentry_skip_upload_for_capture');
    expect(lib).toContain('SENTRY_DISABLE_AUTO_UPLOAD=true');
  });

  it('stays off without a DSN even when flag is on', () => {
    expect(
      isCrashReportingEnabled({
        dsn: '',
        crashReporting: '1',
        metroDev: false,
      }),
    ).toBe(false);
    expect(readSentryDsn('  ')).toBeUndefined();
  });

  it('stays off under DEV scaffold unless explicitly forced on', () => {
    expect(
      isCrashReportingEnabled({
        dsn: 'https://key@o0.ingest.sentry.io/1',
        crashReporting: undefined,
        metroDev: true,
      }),
    ).toBe(false);

    expect(
      isCrashReportingEnabled({
        dsn: 'https://key@o0.ingest.sentry.io/1',
        crashReporting: '0',
        metroDev: false,
      }),
    ).toBe(false);

    expect(
      isCrashReportingEnabled({
        dsn: 'https://key@o0.ingest.sentry.io/1',
        crashReporting: '1',
        metroDev: true,
      }),
    ).toBe(true);
  });

  it('enables on playable fail-closed profiles when DSN is present', () => {
    expect(
      isCrashReportingEnabled({
        dsn: 'https://key@o0.ingest.sentry.io/1',
        crashReporting: undefined,
        metroDev: false,
        allowDevScaffold: '0',
        designCapture: '0',
      }),
    ).toBe(true);
    expect(readCrashReportingFlag('yes')).toBe('on');
    expect(readCrashReportingFlag('off')).toBe('off');
    expect(isCrashReportingForceTestEnabled('1')).toBe(true);
  });

  it('documents a forced test error path in init source', () => {
    const source = readFileSync(initSourcePath, 'utf8');
    expect(source).toContain('BotoreForcedCrashReportingTest');
    expect(source).toContain('nativeCrash');
    expect(source).toContain('sendDefaultPii: false');
    expect(source).toContain('tracesSampleRate: 0');
  });
});

describe('R3 crash event scrubbing', () => {
  it('filters passwords, tokens, and service_role material', () => {
    const scrubbed = scrubRecord({
      password: 'hunter2',
      nested: { service_role: 'eyJ.service_role.abc', ok: 'fine' },
      note: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig',
    }) as Record<string, unknown>;

    expect(scrubbed.password).toBe('[Filtered]');
    expect((scrubbed.nested as Record<string, unknown>).service_role).toBe('[Filtered]');
    expect((scrubbed.nested as Record<string, unknown>).ok).toBe('fine');
    expect(scrubbed.note).toBe('[Filtered]');
  });

  it('strips user email / ip and request cookies before send', () => {
    const event = scrubCrashEvent({
      user: { id: 'u1', email: 'pilot@botore.local', ip_address: '1.2.3.4' },
      request: {
        cookies: 'session=abc',
        headers: { Authorization: 'Bearer secret', 'X-Request-Id': 'r1' },
        data: { password: 'x', fightId: 'f1' },
      },
      extra: { access_token: 'tok', route: 'Replay' },
      breadcrumbs: [{ data: { refresh_token: 'r', label: 'tap' } }],
    });

    expect(event.user).toEqual({ id: 'u1' });
    expect(event.request?.cookies).toBe('[Filtered]');
    expect(event.request?.headers?.Authorization).toBe('[Filtered]');
    expect(event.request?.headers?.['X-Request-Id']).toBe('r1');
    expect((event.request?.data as Record<string, unknown>).password).toBe('[Filtered]');
    expect((event.request?.data as Record<string, unknown>).fightId).toBe('f1');
    expect(event.extra?.access_token).toBe('[Filtered]');
    expect(event.extra?.route).toBe('Replay');
    expect(event.breadcrumbs?.[0]?.data?.refresh_token).toBe('[Filtered]');
    expect(event.breadcrumbs?.[0]?.data?.label).toBe('tap');
  });
});
