/**
 * Design-capture weapon pin — maps deep-link / env aliases onto catalogue ids
 * so live-fight capture can save axe (etc.) before combat-v1 starts.
 */
import { weaponCatalogueId } from '../garage/loadout/proofCatalogue';
import { peekCaptureIntent } from './captureIntentState';
import { readDesignCaptureInitialWeapon } from './captureEnv';

/** Prefer deep-link intent, then baked EXPO_PUBLIC_DESIGN_CAPTURE_WEAPON. */
export function resolveCaptureWeaponCatalogueId(): string | null {
  const raw = peekCaptureIntent().weaponId ?? readDesignCaptureInitialWeapon();
  if (!raw) return null;
  return weaponCatalogueId(raw);
}

export function loadoutHasCaptureWeapon(
  confirmedWeapon: string | null | undefined,
  wantedCatalogueId: string | null,
): boolean {
  if (!wantedCatalogueId) return true;
  if (!confirmedWeapon) return false;
  return weaponCatalogueId(confirmedWeapon) === wantedCatalogueId;
}
