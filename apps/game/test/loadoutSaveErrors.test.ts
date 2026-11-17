import { describe, expect, it } from 'vitest';
import { loadoutSavePlayerMessage } from '../src/garage/loadout/loadoutSaveErrors';

describe('loadoutSavePlayerMessage', () => {
  it('maps unpublished atlas to plain language', () => {
    expect(
      loadoutSavePlayerMessage({
        code: '22023',
        message: 'unpublished_atlas_version: v1',
      }),
    ).toMatch(/not ready to save/i);
  });

  it('maps network and auth failures without raw fetch text', () => {
    expect(
      loadoutSavePlayerMessage({
        code: 'network_error',
        message: 'Network request failed',
      }),
    ).toMatch(/offline/i);
    expect(
      loadoutSavePlayerMessage({
        code: 'unauthenticated',
        message: 'JWT expired',
      }),
    ).toMatch(/session expired/i);
  });

  it('never returns machine-prefixed SQL exceptions as the detail', () => {
    const msg = loadoutSavePlayerMessage({
      code: 'P0002',
      message: 'unknown_atlas_version: v99',
    });
    expect(msg.toLowerCase()).not.toContain('unknown_atlas_version');
    expect(msg).toMatch(/could not save changes/i);
  });

  it('maps SQLSTATE 42501 / permission denied to the default save failure', () => {
    const msg = loadoutSavePlayerMessage({
      code: '42501',
      message: 'permission denied for function save_bot_loadout',
    });
    expect(msg).toBe('Could not save changes. Your equipped loadout is unchanged.');
    expect(msg.toLowerCase()).not.toContain('permission denied');
  });

  it('maps PGRST codes to the default save failure', () => {
    const msg = loadoutSavePlayerMessage({
      code: 'PGRST202',
      message: 'Could not find the function public.save_bot_loadout(...) in the schema cache',
    });
    expect(msg).toBe('Could not save changes. Your equipped loadout is unchanged.');
    expect(msg.toLowerCase()).not.toContain('schema cache');
  });

  it('maps unmatched English server text to the default save failure', () => {
    const msg = loadoutSavePlayerMessage({
      code: 'unexpected',
      message: 'relation "bot_loadout_versions" does not exist',
    });
    expect(msg).toBe('Could not save changes. Your equipped loadout is unchanged.');
    expect(msg.toLowerCase()).not.toContain('relation');
  });
});
