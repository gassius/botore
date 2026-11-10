import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryAuthSessionStore } from '../src/garage/auth/authSessionStore';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import {
  NATIVE_IDENTITY_MISCONFIGURED_CODE,
  signInWithNativePlatformIdentity,
} from '../src/garage/auth/nativePlatformIdentity';
import {
  isWebPreviewAuthEnabled,
  readWebPreviewDevCredentials,
  WEB_PREVIEW_AUTH_MISSING_PASSWORD_CODE,
  WEB_PREVIEW_AUTH_NATIVE_BLOCKED_CODE,
  WEB_PREVIEW_DEV_EMAIL,
} from '../src/garage/auth/previewAuth';
import { runSilentFirstLaunchAuth } from '../src/garage/auth/silentFirstLaunchAuth';
import { SupabaseAuthAdapter } from '../src/garage/auth/SupabaseAuthAdapter';
import { UnavailableAuthAdapter } from '../src/garage/auth/UnavailableAuthAdapter';
import { PLAYABLE_MISCONFIGURED_CODE } from '../src/runtime/devScaffoldPolicy';

const garageRootPath = join(process.cwd(), 'src/garage/GarageRoot.tsx');
const previewAuthPath = join(process.cwd(), 'src/garage/auth/previewAuth.ts');
const envExamplePath = join(process.cwd(), '.env.example');

const PREVIEW_ENV_KEYS = [
  'EXPO_PUBLIC_WEB_PREVIEW_AUTH',
  'EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_OS',
] as const;

function snapshotPreviewEnv(): Record<(typeof PREVIEW_ENV_KEYS)[number], string | undefined> {
  const out = {} as Record<(typeof PREVIEW_ENV_KEYS)[number], string | undefined>;
  for (const key of PREVIEW_ENV_KEYS) out[key] = process.env[key];
  return out;
}

function restorePreviewEnv(
  snap: Record<(typeof PREVIEW_ENV_KEYS)[number], string | undefined>,
): void {
  for (const key of PREVIEW_ENV_KEYS) {
    const value = snap[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('C12 silent first-launch auth (web preview + platform-auth)', () => {
  const previous = snapshotPreviewEnv();

  afterEach(() => {
    restorePreviewEnv(previous);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('GarageRoot never mounts AuthEntryScreen on the first-run path', () => {
    const source = readFileSync(garageRootPath, 'utf8');
    expect(source).not.toMatch(/from ['"].*AuthEntryScreen['"]/);
    expect(source).not.toMatch(/<AuthEntryScreen[\s/>]/);
    expect(source).toMatch(/SessionAuthErrorScreen/);
    expect(source).toMatch(/authBootError/);
  });

  it('does not ship signInAnonymously as a product path', () => {
    const authSources = [
      readFileSync(join(process.cwd(), 'src/garage/auth/AuthPort.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/garage/auth/SupabaseAuthAdapter.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/garage/auth/silentFirstLaunchAuth.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/garage/auth/nativePlatformIdentity.ts'), 'utf8'),
      readFileSync(join(process.cwd(), 'src/garage/LoadoutSessionContext.tsx'), 'utf8'),
    ].join('\n');
    expect(authSources).not.toMatch(/signInAnonymously/);
    expect(authSources).not.toMatch(/auth\/v1\/signup/);
    expect(authSources).not.toMatch(/signInWithIdToken/);
  });

  it('never commits a web-preview password literal', () => {
    const previewSource = readFileSync(previewAuthPath, 'utf8');
    const envExample = readFileSync(envExamplePath, 'utf8');
    expect(previewSource).not.toMatch(/local-only-password|dev-password/);
    expect(envExample).toMatch(/EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD=/);
    expect(envExample).not.toMatch(/EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD=\S+/);
  });

  it('blocks web-preview credentials on native runtimes even when flag is set', () => {
    expect(
      isWebPreviewAuthEnabled({
        flag: '1',
        expoOs: 'ios',
      }),
    ).toBe(false);
    expect(
      readWebPreviewDevCredentials({
        flag: '1',
        password: 'secret-from-vercel',
        expoOs: 'android',
      }),
    ).toMatchObject({
      ok: false,
      code: WEB_PREVIEW_AUTH_NATIVE_BLOCKED_CODE,
    });
  });

  it('reads fixed Development email and env password on web preview', () => {
    const creds = readWebPreviewDevCredentials({
      flag: '1',
      password: 'from-vercel-only',
      expoOs: 'web',
    });
    expect(creds).toEqual({
      ok: true,
      email: WEB_PREVIEW_DEV_EMAIL,
      password: 'from-vercel-only',
    });
  });

  it('fails closed when web-preview password env is missing', () => {
    delete process.env.EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD;
    const creds = readWebPreviewDevCredentials({
      flag: '1',
      password: undefined,
      expoOs: 'web',
    });
    expect(creds).toMatchObject({
      ok: false,
      code: WEB_PREVIEW_AUTH_MISSING_PASSWORD_CODE,
    });
  });

  it('silent first-launch restores persisted session before preview sign-in', async () => {
    const store = createMemoryAuthSessionStore({
      accessToken: 'restored',
      refreshToken: 'r',
      userId: 'user-1',
      email: WEB_PREVIEW_DEV_EMAIL,
      expiresAt: null,
    });
    const auth = new SupabaseAuthAdapter(
      { url: 'http://127.0.0.1:54321', anonKey: 'anon-test-key' },
      store,
    );
    process.env.EXPO_PUBLIC_WEB_PREVIEW_AUTH = '1';
    process.env.EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD = 'should-not-be-used';
    process.env.EXPO_OS = 'web';

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSilentFirstLaunchAuth(auth);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.accessToken).toBe('restored');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('silent first-launch password-grants Development user on web preview', async () => {
    const auth = new DevAuthAdapter();
    process.env.EXPO_PUBLIC_WEB_PREVIEW_AUTH = '1';
    process.env.EXPO_PUBLIC_WEB_PREVIEW_DEV_PASSWORD = 'from-vercel-only';
    process.env.EXPO_OS = 'web';

    const result = await runSilentFirstLaunchAuth(auth);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.email).toBe(WEB_PREVIEW_DEV_EMAIL);
  });

  it('silent first-launch device-fallback → platform-auth when preview is off', async () => {
    const auth = new DevAuthAdapter();
    delete process.env.EXPO_PUBLIC_WEB_PREVIEW_AUTH;
    process.env.EXPO_OS = 'ios';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        provider: 'device_fallback',
        platformId: 'device:test-id',
        session: {
          access_token: 'edge-access',
          refresh_token: 'edge-refresh',
          expires_at: null,
          user_id: 'user-edge-1',
          email: null,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSilentFirstLaunchAuth(auth);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.accessToken).toBe('edge-access');
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { provider: string; deviceId: string };
    expect(body.provider).toBe('device_fallback');
    expect(body.deviceId.length).toBeGreaterThanOrEqual(16);
  });

  it('native identity fails closed when Supabase public config is missing', async () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const result = await signInWithNativePlatformIdentity(new DevAuthAdapter());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(NATIVE_IDENTITY_MISCONFIGURED_CODE);
  });

  it('unavailable auth still refuses password sign-in without DEV fallback', async () => {
    const auth = new UnavailableAuthAdapter();
    const result = await auth.signInWithPassword({
      email: WEB_PREVIEW_DEV_EMAIL,
      password: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(PLAYABLE_MISCONFIGURED_CODE);
  });
});
