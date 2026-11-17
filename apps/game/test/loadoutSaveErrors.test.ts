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
});
