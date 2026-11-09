import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_CAPTURE_SCHEME,
  buildDesignCaptureUrl,
  isDesignCaptureEnabled,
  listCaptureRoutes,
  parseDesignCaptureUrl,
  readDesignCaptureConfig,
} from '../src/design-capture/captureEnv';
import { FIRST_RUN_ROUTES } from '../src/first-run/routes';

describe('C7 design-capture helpers', () => {
  it('treats only explicit truthy flags as capture mode', () => {
    expect(isDesignCaptureEnabled(undefined)).toBe(false);
    expect(isDesignCaptureEnabled('0')).toBe(false);
    expect(isDesignCaptureEnabled('1')).toBe(true);
    expect(isDesignCaptureEnabled('true')).toBe(true);
  });

  it('reads initial route only when capture mode is on', () => {
    expect(readDesignCaptureConfig({ flag: '1', route: 'Replay' })).toEqual({
      enabled: true,
      initialRoute: 'Replay',
      initialPaintId: null,
      initialWeaponId: null,
    });

    expect(readDesignCaptureConfig({ flag: undefined, route: 'Replay' })).toEqual({
      enabled: false,
      initialRoute: null,
      initialPaintId: null,
      initialWeaponId: null,
    });

    expect(readDesignCaptureConfig({ flag: '1', route: 'NotARoute' })).toEqual({
      enabled: true,
      initialRoute: null,
      initialPaintId: null,
      initialWeaponId: null,
    });

    expect(
      readDesignCaptureConfig({ flag: '1', route: 'Stable', paint: 'petrol', weapon: 'axe' }),
    ).toEqual({
      enabled: true,
      initialRoute: 'Stable',
      initialPaintId: 'petrol',
      initialWeaponId: 'axe',
    });
  });

  it('parses botore://capture deep links used by adb/simctl scripts', () => {
    expect(parseDesignCaptureUrl('botore://capture/Replay')).toEqual({
      route: 'Replay',
      mute: null,
      paintId: null,
      weaponId: null,
    });
    expect(parseDesignCaptureUrl('botore://capture/Replay?mute=1')).toEqual({
      route: 'Replay',
      mute: true,
      paintId: null,
      weaponId: null,
    });
    expect(parseDesignCaptureUrl('botore://capture?route=Ranking')).toEqual({
      route: 'Ranking',
      mute: null,
      paintId: null,
      weaponId: null,
    });
    expect(parseDesignCaptureUrl('botore://capture/Stable?paint=petrol&weapon=axe')).toEqual({
      route: 'Stable',
      mute: null,
      paintId: 'petrol',
      weaponId: 'axe',
    });
    expect(parseDesignCaptureUrl('https://example.com/capture/Replay')).toEqual({
      route: null,
      mute: null,
      paintId: null,
      weaponId: null,
    });
    expect(
      buildDesignCaptureUrl('Stable', { mute: true, paintId: 'petrol', weaponId: 'dagger' }),
    ).toBe(`${DESIGN_CAPTURE_SCHEME}://capture/Stable?mute=1&paint=petrol&weapon=dagger`);
  });

  it('lists the same first-run routes the shell owns', () => {
    expect([...listCaptureRoutes()]).toEqual([...FIRST_RUN_ROUTES]);
  });

  it('keeps Expo public design-capture env reads as static member expressions', () => {
    const source = readFileSync(join(process.cwd(), 'src/design-capture/captureEnv.ts'), 'utf8');
    expect(source).toContain('process.env.EXPO_PUBLIC_DESIGN_CAPTURE');
    expect(source).toContain('process.env.EXPO_PUBLIC_DESIGN_CAPTURE_ROUTE');
    expect(source).toContain('process.env.EXPO_PUBLIC_DESIGN_CAPTURE_PAINT');
    expect(source).toContain('process.env.EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON');
    expect(source).not.toMatch(/process\?\.env/);
    expect(source).not.toMatch(/env\?\.\[/);
    const bootstrap = readFileSync(
      join(process.cwd(), 'src/garage/LoadoutSessionContext.tsx'),
      'utf8',
    );
    expect(bootstrap).toContain('isDesignCaptureEnabled');
  });
});
