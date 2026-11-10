import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectPlatformProof,
  EXPO_GAME_SERVICES_LINKED,
  EXPO_GAME_SERVICES_PACKAGE,
  tryLoadExpoGameServices,
} from '../src/garage/auth/platformProof';

const packageJsonPath = join(process.cwd(), 'package.json');
const platformProofPath = join(process.cwd(), 'src/garage/auth/platformProof.ts');

describe('platformProof optional game-services wiring', () => {
  it('keeps EXPO_GAME_SERVICES_LINKED in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const listed =
      Boolean(pkg.dependencies?.[EXPO_GAME_SERVICES_PACKAGE]) ||
      Boolean(pkg.optionalDependencies?.[EXPO_GAME_SERVICES_PACKAGE]);
    expect(EXPO_GAME_SERVICES_LINKED).toBe(listed);
  });

  it('does not ship a static require of the missing game-services package', () => {
    const source = readFileSync(platformProofPath, 'utf8');
    // Strip block/line comments so docs can mention the forbidden pattern.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // A live require() of the missing package becomes metroRequire(undefined)
    // and fatals Hermes on Android release boot.
    expect(code).not.toMatch(/require\(\s*['"]@tubinex\/expo-game-services['"]\s*\)/);
    expect(code).not.toMatch(/require\(\s*EXPO_GAME_SERVICES_PACKAGE\s*\)/);
    expect(source).toMatch(/EXPO_GAME_SERVICES_LINKED/);
  });

  it('tryLoadExpoGameServices returns null when unlinked', () => {
    expect(tryLoadExpoGameServices({ linked: false })).toBeNull();
    expect(tryLoadExpoGameServices()).toBeNull();
  });

  it('collectPlatformProof returns null when unlinked (device-fallback path)', async () => {
    await expect(collectPlatformProof({ linked: false })).resolves.toBeNull();
  });

  it('collectPlatformProof uses an injected module when linked for tests', async () => {
    const proof = await collectPlatformProof({
      linked: true,
      loadImpl: () => ({
        requestServerIdentityProof: async () => ({
          provider: 'play_games',
          serverAuthCode: 'auth-code-1',
        }),
      }),
    });
    expect(proof).toEqual({ provider: 'play_games', serverAuthCode: 'auth-code-1' });
  });
});
