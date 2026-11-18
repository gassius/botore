import { describe, expect, it } from 'vitest';
import { loadoutHasCaptureWeapon } from '../src/design-capture/captureWeapon';
import { weaponCatalogueId } from '../src/garage/loadout/proofCatalogue';

describe('capture weapon pin', () => {
  it('maps aliases onto catalogue ids', () => {
    expect(weaponCatalogueId('axe')).toBe('weapon-axe');
    expect(weaponCatalogueId('weapon-axe')).toBe('weapon-axe');
  });

  it('treats missing pin as satisfied and matches confirmed axe', () => {
    expect(loadoutHasCaptureWeapon('weapon-sword', null)).toBe(true);
    expect(loadoutHasCaptureWeapon('weapon-axe', 'weapon-axe')).toBe(true);
    expect(loadoutHasCaptureWeapon('axe', 'weapon-axe')).toBe(true);
    expect(loadoutHasCaptureWeapon('weapon-sword', 'weapon-axe')).toBe(false);
  });
});
