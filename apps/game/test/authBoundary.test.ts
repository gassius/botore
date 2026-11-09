import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { SupabaseAuthAdapter } from '../src/garage/auth/SupabaseAuthAdapter';
import { readSupabasePublicConfig } from '../src/garage/auth/supabasePublicConfig';
import {
  paintCatalogueId,
  paintUiAlias,
  weaponCatalogueId,
  weaponUiAlias,
} from '../src/garage/loadout/proofCatalogue';

/** Vitest cwd is apps/game — assert the Expo-inlinable source form itself. */
const configSourcePath = join(process.cwd(), 'src/garage/auth/supabasePublicConfig.ts');

describe('F8 auth / ownership seams', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps Expo public env reads as static process.env member expressions', () => {
    const source = readFileSync(configSourcePath, 'utf8');
    expect(source).toContain('process.env.EXPO_PUBLIC_SUPABASE_URL');
    expect(source).toContain('process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(source).not.toMatch(/process\?\.env/);
    expect(source).not.toMatch(/env\?\.\[/);
    expect(source).not.toMatch(/env\[name\]/);
    expect(source).not.toMatch(/globalThis\.process/);
  });

  it('dev auth issues a session without service-role material', async () => {
    const auth = new DevAuthAdapter();
    const result = await auth.signInWithPassword({
      email: 'pilot@botore.local',
      password: 'secret',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.accessToken).not.toMatch(/service_role/i);
    expect(auth.kind).toBe('dev');
  });

  it('refuses service_role keys if somehow present in public env', () => {
    const prevUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'eyJ.service_role.fake';
    try {
      expect(() => readSupabasePublicConfig()).toThrow(/service_role/i);
    } finally {
      if (prevUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      else process.env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = prevKey;
    }
  });

  it('expires cached sessions and refreshes when possible', async () => {
    const auth = new SupabaseAuthAdapter({
      url: 'http://127.0.0.1:54321',
      anonKey: 'anon-test-key',
    });
    const clock = 1_700_000_000;
    auth.nowSeconds = () => clock;
    auth.setSessionForTests({
      accessToken: 'expired-access',
      refreshToken: 'refresh-me',
      userId: 'user-1',
      email: 'pilot@botore.local',
      expiresAt: clock - 10,
    });

    const jsonResponse = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: 'fresh-access',
        refresh_token: 'refresh-me',
        expires_at: clock + 3600,
        user: { id: 'user-1', email: 'pilot@botore.local' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const refreshed = await auth.getSession();
    expect(refreshed?.accessToken).toBe('fresh-access');
    expect(fetchMock).toHaveBeenCalledOnce();

    auth.setSessionForTests({
      accessToken: 'stale',
      refreshToken: 'bad-refresh',
      userId: 'user-1',
      email: 'pilot@botore.local',
      expiresAt: clock - 10,
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'invalid_grant', error_description: 'refresh failed' }, 400),
    );
    const cleared = await auth.getSession();
    expect(cleared).toBeNull();
  });

  it('maps Oxide/Petrol UI aliases to F1 catalogue ids without expansion', () => {
    expect(paintCatalogueId('oxide')).toBe('paint-crimson');
    expect(paintCatalogueId('petrol')).toBe('paint-cobalt');
    expect(paintUiAlias('paint-crimson')).toBe('oxide');
    expect(weaponCatalogueId('axe')).toBe('weapon-axe');
    expect(weaponUiAlias('weapon-dagger')).toBe('dagger');
  });
});
