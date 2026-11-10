import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Vitest cwd is apps/game when run via the package filter. */
const gameRoot = process.cwd();
const repoRoot = join(gameRoot, '../..');

describe('C9 cold-start splash→title gate', () => {
  it('does not hide native splash until cold-start intent is ready / hold path loads title', () => {
    const root = readFileSync(join(gameRoot, 'src/garage/GarageRoot.tsx'), 'utf8');
    expect(root).toContain('coldStartIntentReady');
    expect(root).toContain('COLD_START_NATIVE_SPLASH_MIN_MS');
    expect(root).toContain('COLD_START_SPLASH_SAFETY_MS');
    expect(root).toContain('maybeReleaseNativeSplash');
    // Hold-title remount must keep image callbacks (lost release caused iOS title-only strip).
    expect(root).toMatch(/LaunchTitleScreen[\s\S]*onImageLoad/);
  });

  it('hold-title dwell outlasts the normal safety cap (safety must not defeat hold)', () => {
    const root = readFileSync(join(gameRoot, 'src/garage/GarageRoot.tsx'), 'utf8');
    expect(root).toContain('EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS');
    expect(root).toContain('readColdStartSplashHoldMs');
    expect(root).toContain('COLD_START_NATIVE_SPLASH_MIN_MS');
    expect(root).toContain('COLD_START_SPLASH_SAFETY_MS');
    const normalSafetyMatch = root.match(/NATIVE_SPLASH_SAFETY_MS\s*=\s*(\d+)/);
    expect(normalSafetyMatch?.[1], 'missing NATIVE_SPLASH_SAFETY_MS').toBeTruthy();
    const normalSafetyMs = Number(normalSafetyMatch?.[1] ?? '0');
    // Default hold is 8s; CI bakes ≥60s via EXPO_PUBLIC_COLD_START_SPLASH_HOLD_MS.
    expect(root).toMatch(/return 8000/);
    expect(root).toContain('COLD_START_NATIVE_SPLASH_MIN_MS + 30_000');
    expect(normalSafetyMs).toBeLessThan(8000);
    expect(root).toMatch(
      /coldStartHoldTitle[\s\S]*COLD_START_SPLASH_SAFETY_MS[\s\S]*NATIVE_SPLASH_SAFETY_MS/,
    );
    expect(root).toMatch(/isDesignCaptureEnabled\(\)\s*&&\s*!coldStartIntentReady/);
  });

  it('lazy-loads Sentry so design-capture boots skip native SDK cost', () => {
    const index = readFileSync(join(gameRoot, 'index.js'), 'utf8');
    const boot = readFileSync(join(gameRoot, 'src/crashReporting/bootstrap.ts'), 'utf8');
    expect(index).toContain('bootstrapCrashReporting');
    expect(boot).toContain('isCrashReportingEnabled');
    expect(boot).toMatch(/require\('\.\/initCrashReporting'\)/);
    expect(boot).not.toMatch(/from '@sentry\/react-native'/);
  });

  it('exposes coldStartIntentReady from the garage session', () => {
    const ctx = readFileSync(join(gameRoot, 'src/garage/LoadoutSessionContext.tsx'), 'utf8');
    expect(ctx).toContain('coldStartIntentReady');
    expect(ctx).toContain('setColdStartIntentReady(true)');
  });

  it('iOS cold-start capture screenshots in parallel with launch (not sync-then-burst)', () => {
    const script = readFileSync(
      join(repoRoot, 'scripts/native-capture/ios-cold-start-capture.sh'),
      'utf8',
    );
    expect(script).toMatch(/async \+ parallel splash poll/);
    expect(script).toMatch(/simctl launch[\s\S]*&/);
    expect(script).toContain('LAUNCH_PID');
    // Must not wait for launch to finish before the splash screenshot loop.
    expect(script).not.toMatch(
      /launch ok — waiting for splash[\s\S]*while python3[\s\S]*splash_deadline/,
    );
  });
});
