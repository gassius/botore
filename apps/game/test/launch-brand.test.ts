import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRAND_WORDMARK_ASPECT,
  TITLE_SILHOUETTE_ASPECT,
  uiKitAssets,
} from '../src/garage-tag/assets';
import { garageTag } from '../src/garage-tag/tokens';

/** Vitest cwd is apps/game when run via the package filter. */
const gameRoot = process.cwd();

describe('C6 launch-v001 brand', () => {
  it('keeps Oxide at kit-v002 brand FINAL', () => {
    expect(garageTag.oxide.toUpperCase()).toBe('#E8771C');
  });

  it('exposes launch-v001 wordmark aspect and silhouette title asset', () => {
    expect(BRAND_WORDMARK_ASPECT).toEqual({ width: 2400, height: 558 });
    expect(TITLE_SILHOUETTE_ASPECT).toEqual({ width: 1290, height: 2796 });
    expect(uiKitAssets.titleSilhouette).toBeDefined();
    expect(uiKitAssets.wordmarkDark).toBeDefined();
    expect(uiKitAssets.appIcon).toBeDefined();
  });

  it('wires native icon/splash via expo-splash-screen without legacy splash key', () => {
    const appJson = JSON.parse(readFileSync(join(gameRoot, 'app.json'), 'utf8')) as {
      expo: {
        splash?: unknown;
        icon: string;
        plugins: Array<string | [string, Record<string, unknown>]>;
        android: { adaptiveIcon: Record<string, string> };
      };
    };

    expect(appJson.expo.splash).toBeUndefined();
    expect(appJson.expo.icon).toContain('launch-v001/icon/icon-ios-1024.png');

    const splashPlugin = appJson.expo.plugins.find(
      (p) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    ) as [string, Record<string, unknown>] | undefined;
    expect(splashPlugin).toBeDefined();
    const cfg = splashPlugin![1];
    expect(cfg.backgroundColor).toBe('#302D27');
    expect(String(cfg.image)).toContain('splash-logo-1284.png');
    const android = cfg.android as Record<string, unknown>;
    expect(String(android.image)).toContain('splash-icon-android-1024.png');
    expect(appJson.expo.android.adaptiveIcon.monochromeImage).toContain(
      'adaptive-monochrome-1024.png',
    );
  });

  it('ships launch-v001 files and retires ui-kit brand wordmark/icon/launch', () => {
    const launchFiles = [
      'assets/launch-v001/icon/icon-ios-1024.png',
      'assets/launch-v001/icon/adaptive-foreground-1024.png',
      'assets/launch-v001/icon/adaptive-background-1024.png',
      'assets/launch-v001/icon/adaptive-monochrome-1024.png',
      'assets/launch-v001/splash/splash-logo-1284.png',
      'assets/launch-v001/splash/splash-icon-android-1024.png',
      'assets/launch-v001/title/title-composite-silhouette-1290x2796.png',
      'assets/launch-v001/wordmark/wordmark-dark-2400w.png',
    ];
    for (const rel of launchFiles) {
      expect(() => readFileSync(join(gameRoot, rel))).not.toThrow();
    }

    const retired = [
      'assets/ui-kit-v0.1/brand/app-icon.png',
      'assets/ui-kit-v0.1/brand/launch-static.png',
      'assets/ui-kit-v0.1/brand/wordmark-dark.png',
      'assets/ui-kit-v0.1/brand/wordmark-light.png',
      'assets/ui-kit-v0.1/brand/wordmark-small.png',
    ];
    for (const rel of retired) {
      expect(() => readFileSync(join(gameRoot, rel))).toThrow();
    }
  });
});
