import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DOCUMENTED_ACCOUNT_DELETE_PATH,
  PUBLIC_PRIVACY_PATH,
  isPublicPrivacyPath,
  publicWebHref,
  readPublicWebOrigin,
} from '../src/legal/privacyPaths';
import { PRIVACY_POLICY_TITLE, privacyPolicySections } from '../src/legal/privacyPolicyContent';

const ROOT = join(__dirname, '..');

describe('R6 privacy policy disclosure', () => {
  const prevOrigin = process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN;

  afterEach(() => {
    if (prevOrigin === undefined) delete process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN;
    else process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN = prevOrigin;
  });

  it('exposes stable public paths for store materials', () => {
    expect(PUBLIC_PRIVACY_PATH).toBe('/privacy');
    expect(DOCUMENTED_ACCOUNT_DELETE_PATH).toBe('/account/delete');
  });

  it('detects the public privacy path with or without trailing slash', () => {
    expect(isPublicPrivacyPath('/privacy')).toBe(true);
    expect(isPublicPrivacyPath('/privacy/')).toBe(true);
    expect(isPublicPrivacyPath('/account/delete')).toBe(false);
    expect(isPublicPrivacyPath(null)).toBe(false);
  });

  it('builds absolute hrefs when EXPO_PUBLIC_PUBLIC_WEB_ORIGIN is set', () => {
    process.env.EXPO_PUBLIC_PUBLIC_WEB_ORIGIN = 'https://game.example/';
    expect(readPublicWebOrigin()).toBe('https://game.example');
    expect(publicWebHref(PUBLIC_PRIVACY_PATH)).toBe('https://game.example/privacy');
    expect(publicWebHref(DOCUMENTED_ACCOUNT_DELETE_PATH)).toBe(
      'https://game.example/account/delete',
    );
  });

  it('discloses platform auth, synthetic email, deletion, and retention', () => {
    const ids = privacyPolicySections.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'identity',
        'synthetic-email',
        'session',
        'data',
        'deletion',
        'retention',
        'store',
      ]),
    );
    const blob = privacyPolicySections.map((s) => s.paragraphs.join(' ')).join('\n');
    expect(blob).toMatch(/Game Center/i);
    expect(blob).toMatch(/Play Games/i);
    expect(blob).toMatch(/device-fallback|device-stored/i);
    expect(blob).toMatch(/players\.botore\.internal/);
    expect(blob).toContain(DOCUMENTED_ACCOUNT_DELETE_PATH);
    expect(blob).toMatch(/soft-delete|tombstone|anonymiz/i);
    expect(PRIVACY_POLICY_TITLE).toMatch(/Privacy/i);
  });

  it('keeps docs/legal/privacy-policy.md aligned on required topics', () => {
    const md = readFileSync(join(ROOT, '../../docs/legal/privacy-policy.md'), 'utf8');
    expect(md).toContain('/privacy');
    expect(md).toContain('/account/delete');
    expect(md).toMatch(/Game Center/);
    expect(md).toMatch(/Play Games/);
    expect(md).toContain('players.botore.internal');
    expect(md).toMatch(/Sentry|crash/i);
  });

  it('wires App public gate, Stable entry, and vercel rewrite', () => {
    const app = readFileSync(join(ROOT, 'App.tsx'), 'utf8');
    expect(app).toContain('isPublicPrivacyPath');
    expect(app).toContain('PublicPrivacyPolicyScreen');

    const stable = readFileSync(join(ROOT, 'src/garage/screens/StableScreen.tsx'), 'utf8');
    expect(stable).toContain('PrivacyPolicyScreen');
    expect(stable).toContain('stable-privacy-policy');

    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
      rewrites?: Array<{ source: string; destination: string }>;
    };
    const sources = (vercel.rewrites ?? []).map((r) => r.source);
    expect(sources).toContain('/privacy');
    expect(sources).toContain('/privacy/');
  });
});
