/**
 * PLACEHOLDER Workshop Frame kit + shared weapon grip.
 *
 * All coordinates are PROVISIONAL stand-ins so assembly / swap / mirror can be
 * unit-tested before Game Art delivers the compatible kit. Do not treat these
 * numbers as export sizes, pivots, or performance budgets.
 */

import type { ProvisionalPoint } from './types';

/** PROVISIONAL kit canvas — not an approved export resolution. */
export const PLACEHOLDER_CANVAS = {
  width: 120,
  height: 160,
  provisional: true as const,
};

/** Shared grip socket for sword / axe / dagger (PROVISIONAL). */
export const PLACEHOLDER_GRIP: ProvisionalPoint = {
  x: 86,
  y: 78,
  provisional: true,
};

export type WeaponKind = 'sword' | 'axe' | 'dagger';

export interface WeaponKitSpec {
  readonly kind: WeaponKind;
  readonly catalogueId: string;
  readonly width: number;
  readonly height: number;
  /** Offset from grip so the handle sits in the hand (PROVISIONAL). */
  readonly gripOffset: ProvisionalPoint;
  readonly color: string;
  readonly label: string;
}

export const PLACEHOLDER_WEAPONS: Readonly<Record<WeaponKind, WeaponKitSpec>> = {
  sword: {
    kind: 'sword',
    catalogueId: 'weapon-sword',
    width: 18,
    height: 54,
    gripOffset: { x: -6, y: -40, provisional: true },
    color: '#C5CCD4',
    label: 'SWORD',
  },
  axe: {
    kind: 'axe',
    catalogueId: 'weapon-axe',
    width: 34,
    height: 48,
    gripOffset: { x: -14, y: -36, provisional: true },
    color: '#A8B0BA',
    label: 'AXE',
  },
  dagger: {
    kind: 'dagger',
    catalogueId: 'weapon-dagger',
    width: 14,
    height: 36,
    gripOffset: { x: -4, y: -26, provisional: true },
    color: '#D0D6DE',
    label: 'DAGGER',
  },
};

const WEAPON_BY_ID: ReadonlyMap<string, WeaponKitSpec> = new Map(
  Object.values(PLACEHOLDER_WEAPONS).flatMap((w) => [
    [w.catalogueId, w],
    [w.kind, w],
    [`weapon-${w.kind}`, w],
  ]),
);

export function resolveWeaponKit(weaponId: string): WeaponKitSpec {
  return WEAPON_BY_ID.get(weaponId) ?? PLACEHOLDER_WEAPONS.sword;
}

export function isKnownAssemblerWeaponId(weaponId: string): boolean {
  return WEAPON_BY_ID.has(weaponId);
}

/** First chassis id from F5 proof pack — no catalogue expansion. */
export const PLACEHOLDER_CHASSIS_ID = 'chassis-basic';

/** Metal / outline colours for PLACEHOLDER Workshop Frame stand-ins. */
export const PLACEHOLDER_METAL = {
  frame: '#4A5158',
  plate: '#6A727A',
  joint: '#8A929A',
  outline: '#1A1E22',
  eye: '#F0C040',
  shadow: 'rgba(26, 30, 34, 0.28)',
} as const;
