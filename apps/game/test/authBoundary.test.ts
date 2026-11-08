import { describe, expect, it } from 'vitest';
import { DevAuthAdapter } from '../src/garage/auth/DevAuthAdapter';
import { readSupabasePublicConfig } from '../src/garage/auth/supabasePublicConfig';
import {
  paintCatalogueId,
  paintUiAlias,
  weaponCatalogueId,
  weaponUiAlias,
} from '../src/garage/loadout/proofCatalogue';

describe('F8 auth / ownership seams', () => {
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
    const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
    if (!env) return;
    const prevUrl = env.EXPO_PUBLIC_SUPABASE_URL;
    const prevKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'eyJ.service_role.fake';
    expect(() => readSupabasePublicConfig()).toThrow(/service_role/i);
    if (prevUrl === undefined) delete env.EXPO_PUBLIC_SUPABASE_URL;
    else env.EXPO_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    else env.EXPO_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  });

  it('maps Oxide/Petrol UI aliases to F1 catalogue ids without expansion', () => {
    expect(paintCatalogueId('oxide')).toBe('paint-crimson');
    expect(paintCatalogueId('petrol')).toBe('paint-cobalt');
    expect(paintUiAlias('paint-crimson')).toBe('oxide');
    expect(weaponCatalogueId('axe')).toBe('weapon-axe');
    expect(weaponUiAlias('weapon-dagger')).toBe('dagger');
  });
});
