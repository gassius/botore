import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const easPath = join(root, 'eas.json');
const appConfigPath = join(root, 'app.json');
const checklistPath = join(root, '../../docs/architecture/eas-production-credentials.md');
const gitignorePath = join(root, '../../.gitignore');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('R2 EAS production project + credentials scaffolding', () => {
  it('leaves projectId absent or a real UUID (never REPLACE_*) so eas init can link', () => {
    const app = JSON.parse(readFileSync(appConfigPath, 'utf8')) as {
      expo: {
        ios?: { bundleIdentifier?: string };
        android?: { package?: string };
        extra?: { eas?: { projectId?: string } };
      };
    };
    expect(app.expo.ios?.bundleIdentifier).toBe('com.botore.game');
    expect(app.expo.android?.package).toBe('com.botore.game');
    const projectId = app.expo.extra?.eas?.projectId;
    if (projectId === undefined) {
      expect(app.expo.extra?.eas?.projectId).toBeUndefined();
      return;
    }
    expect(typeof projectId).toBe('string');
    expect(projectId.startsWith('REPLACE_')).toBe(false);
    expect(UUID_RE.test(projectId)).toBe(true);
  });

  it('defines production store build + Play internal submit profiles', () => {
    const eas = JSON.parse(readFileSync(easPath, 'utf8')) as {
      cli?: { appVersionSource?: string };
      build: Record<
        string,
        {
          distribution?: string;
          autoIncrement?: boolean;
          android?: { buildType?: string };
          env?: Record<string, string>;
        }
      >;
      submit: Record<
        string,
        {
          android?: { track?: string; releaseStatus?: string };
        }
      >;
    };
    expect(eas.cli?.appVersionSource).toBe('remote');
    expect(eas.build.production?.distribution).toBe('store');
    expect(eas.build.production?.autoIncrement).toBe(true);
    expect(eas.build.production?.android?.buildType).toBe('app-bundle');
    expect(eas.build.production?.env?.EXPO_PUBLIC_CRASH_REPORTING).toBe('1');
    expect(eas.build.preview?.distribution).toBe('internal');
    expect(eas.submit.production?.android?.track).toBe('internal');
    expect(eas.submit.production?.android?.releaseStatus).toBe('draft');
  });

  it('does not bake Supabase secrets or local service-account key paths into eas.json', () => {
    const raw = readFileSync(easPath, 'utf8');
    expect(raw).not.toMatch(/EXPO_PUBLIC_SUPABASE_/);
    expect(raw).not.toMatch(/service_role/);
    expect(raw).not.toMatch(/serviceAccountKeyPath/i);
    // ascAppId / appleTeamId / appleId are identifiers, not secrets — allowed later.
  });

  it('ignores local EAS signing artifacts and Play service-account JSON', () => {
    const gitignore = readFileSync(gitignorePath, 'utf8');
    expect(gitignore).toContain('apps/game/credentials.json');
    expect(gitignore).toContain('apps/game/credentials/');
    expect(gitignore).toContain('*.jks');
    expect(gitignore).toContain('*.keystore');
    expect(gitignore).toContain('*.p8');
    expect(gitignore).toContain('*.p12');
    expect(gitignore).toContain('*.mobileprovision');
    expect(gitignore).toContain('apps/game/play-service-account*.json');
  });

  it('ships the credentials checklist with Carlos steps', () => {
    const doc = readFileSync(checklistPath, 'utf8');
    expect(doc).toContain('eas-cli@latest login');
    expect(doc).toContain('eas-cli@latest init');
    expect(doc).toMatch(/eas init writes.*projectId/i);
    expect(doc).not.toMatch(/REPLACE_WITH_EAS_PROJECT_ID/);
    expect(doc).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(doc).toContain('com.botore.game');
    expect(doc).toContain('Carlos');
    expect(doc).toContain('appVersionSource');
  });
});
