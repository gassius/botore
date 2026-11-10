import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_ENTRY_DEV_EMAIL,
  AUTH_ENTRY_DEV_FOOTNOTE,
  AUTH_ENTRY_DEV_PASSWORD,
} from '../src/garage/auth/authEntryDevAssist';
import {
  AUTH_ENTRY_PLAYER_SUBTITLE,
  isAuthEntryDevAssistEnabled,
  resolveAuthEntryPresentation,
} from '../src/garage/auth/authEntryPresentation';

const ENV_KEYS = [
  'EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD',
  'EXPO_PUBLIC_DESIGN_CAPTURE',
  'EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function snapshotEnv(): Record<EnvKey, string | undefined> {
  const out = {} as Record<EnvKey, string | undefined>;
  for (const key of ENV_KEYS) out[key] = process.env[key];
  return out;
}

function restoreEnv(snap: Record<EnvKey, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearAssistEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

const screenPath = join(process.cwd(), 'src/garage/screens/AuthEntryScreen.tsx');
const presentationPath = join(process.cwd(), 'src/garage/auth/authEntryPresentation.ts');
const assistPath = join(process.cwd(), 'src/garage/auth/authEntryDevAssist.ts');

const FORBIDDEN_PLAYABLE = [
  'dev@botore.local',
  'dev-password',
  'Supabase Auth.',
  'DEV auth scaffold.',
  'Public anon key only',
] as const;

describe('C15 AuthEntry playable presentation', () => {
  const previous = snapshotEnv();

  afterEach(() => {
    restoreEnv(previous);
  });

  it('keeps playable/preview/production fields empty with player-facing copy only', () => {
    clearAssistEnv();
    for (const kind of ['supabase', 'dev', 'unavailable'] as const) {
      const presentation = resolveAuthEntryPresentation(kind, {
        allowDevScaffold: '0',
        designCapture: '0',
      });
      expect(presentation.showDevAssist).toBe(false);
      expect(presentation.email).toBe('');
      expect(presentation.password).toBe('');
      expect(presentation.subtitle).toBe(AUTH_ENTRY_PLAYER_SUBTITLE);
      expect(presentation.footnote).toBeNull();
      expect(presentation.subtitle).not.toMatch(
        /Supabase Auth|DEV auth scaffold|Backend required/i,
      );
      expect(JSON.stringify(presentation)).not.toContain(AUTH_ENTRY_DEV_EMAIL);
      expect(JSON.stringify(presentation)).not.toContain(AUTH_ENTRY_DEV_PASSWORD);
      expect(JSON.stringify(presentation)).not.toContain('Public anon key only');
    }
  });

  it('fails closed when design-capture fail-closed is set (no prefill)', () => {
    clearAssistEnv();
    expect(
      isAuthEntryDevAssistEnabled({
        designCapture: '1',
        designCaptureFailClosed: '1',
      }),
    ).toBe(false);
    const presentation = resolveAuthEntryPresentation('supabase', {
      designCapture: '1',
      designCaptureFailClosed: '1',
    });
    expect(presentation.email).toBe('');
    expect(presentation.password).toBe('');
    expect(presentation.footnote).toBeNull();
  });

  it('prefills and labels DEV assist only for design-capture or ALLOW_DEV_SCAFFOLD', () => {
    clearAssistEnv();
    expect(isAuthEntryDevAssistEnabled({ allowDevScaffold: '1' })).toBe(true);
    expect(isAuthEntryDevAssistEnabled({ designCapture: '1' })).toBe(true);
    // Plain Metro __DEV__ must not unlock AuthEntry prefill (C15 Done when).
    expect(
      isAuthEntryDevAssistEnabled({
        allowDevScaffold: '0',
        designCapture: '0',
      }),
    ).toBe(false);

    const designCapture = resolveAuthEntryPresentation('supabase', { designCapture: '1' });
    expect(designCapture.email).toBe(AUTH_ENTRY_DEV_EMAIL);
    expect(designCapture.password).toBe(AUTH_ENTRY_DEV_PASSWORD);
    expect(designCapture.subtitle).toContain('Supabase Auth.');
    expect(designCapture.footnote).toBe(AUTH_ENTRY_DEV_FOOTNOTE);

    const scaffold = resolveAuthEntryPresentation('dev', { allowDevScaffold: '1' });
    expect(scaffold.email).toBe(AUTH_ENTRY_DEV_EMAIL);
    expect(scaffold.subtitle).toContain('DEV auth scaffold.');
  });

  it('playable AuthEntry surface source must not embed DEV credentials or DEV copy', () => {
    const screen = readFileSync(screenPath, 'utf8');
    const presentation = readFileSync(presentationPath, 'utf8');
    for (const forbidden of FORBIDDEN_PLAYABLE) {
      expect(screen, `AuthEntryScreen must not contain ${forbidden}`).not.toContain(forbidden);
      expect(presentation, `authEntryPresentation must not contain ${forbidden}`).not.toContain(
        forbidden,
      );
    }
    expect(screen).toContain('resolveAuthEntryPresentation');
    expect(presentation).toContain('getDevAuthEntryPresentation');
    expect(presentation).toMatch(/if \(!showDevAssist\)/);
  });

  it('DEV credentials live only in the gated assist module', () => {
    const assist = readFileSync(assistPath, 'utf8');
    expect(assist).toContain("AUTH_ENTRY_DEV_EMAIL = 'dev@botore.local'");
    expect(assist).toContain("AUTH_ENTRY_DEV_PASSWORD = 'dev-password'");
  });
});
