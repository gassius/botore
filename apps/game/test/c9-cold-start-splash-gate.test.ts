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
    const minMatch = root.match(/COLD_START_NATIVE_SPLASH_MIN_MS\s*=\s*(\d+)/);
    const holdSafetyMatch = root.match(/COLD_START_SPLASH_SAFETY_MS\s*=\s*([\d_]+)/);
    const normalSafetyMatch = root.match(/NATIVE_SPLASH_SAFETY_MS\s*=\s*(\d+)/);
    expect(minMatch?.[1], 'missing COLD_START_NATIVE_SPLASH_MIN_MS').toBeTruthy();
    expect(holdSafetyMatch?.[1], 'missing COLD_START_SPLASH_SAFETY_MS').toBeTruthy();
    expect(normalSafetyMatch?.[1], 'missing NATIVE_SPLASH_SAFETY_MS').toBeTruthy();
    const minMs = Number(minMatch?.[1] ?? '0');
    const holdSafetyMs = Number((holdSafetyMatch?.[1] ?? '0').replace(/_/g, ''));
    const normalSafetyMs = Number(normalSafetyMatch?.[1] ?? '0');
    // CI screenshots need several seconds of native splash after hold is known.
    expect(minMs).toBeGreaterThanOrEqual(8000);
    // Hold absolute escape must never fire before the min dwell completes.
    expect(holdSafetyMs).toBeGreaterThan(minMs);
    // Normal boot safety stays short; hold path must not reuse it as the only timer.
    expect(normalSafetyMs).toBeLessThan(minMs);
    // Safety effect must gate on coldStartHoldTitle / coldStartIntentReady.
    expect(root).toMatch(
      /coldStartHoldTitle[\s\S]*COLD_START_SPLASH_SAFETY_MS[\s\S]*NATIVE_SPLASH_SAFETY_MS/,
    );
    expect(root).toMatch(/isDesignCaptureEnabled\(\)\s*&&\s*!coldStartIntentReady/);
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
