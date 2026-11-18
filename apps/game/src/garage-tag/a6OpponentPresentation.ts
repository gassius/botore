/**
 * Shared Opponents card + Tale of the Tape presentation for A6 roster NPCs.
 * One resolver — both screens use the same paint/weapon and art source.
 * Known A6 NPCs (by character id or display name) use the authored bake, not a
 * separate combat-seed loadout. Can Hook: primer + Hook (kit spear / shield
 * off-hand read) so the WEAPON tape row matches the card identity.
 */

import {
  paintCatalogueId,
  paintDisplayLabel,
  weaponCatalogueId,
  weaponDisplayLabel,
} from '../garage/loadout/proofCatalogue';
import { A6_OPPONENT_BAKES, resolveOpponentNpcId, type A6OpponentBake } from './a6OpponentMatch';
import type { A6OpponentNpcId, A6PaintTileId, A6WeaponTileId } from './a6TilesIds';

export type OpponentPresentationInput = {
  readonly characterId: string;
  readonly displayName: string;
  /** Candidate / seed loadout — used only when not an A6 roster NPC. */
  readonly paintId: string;
  readonly weaponId: string;
};

export type OpponentPresentation = {
  /** A6 NPC slug when identity resolves; null for unknown opponents. */
  readonly npcId: A6OpponentNpcId | null;
  /** Catalogue paint id for assembler / tape / panel bake. */
  readonly paintId: string;
  /** Catalogue weapon id for assembler / tape / panel bake. */
  readonly weaponId: string;
  /** Player-facing WEAPON tape / card label (Can Hook → Hook, not Spear). */
  readonly weaponLabel: string;
  /** Player-facing PAINT tape label. */
  readonly paintLabel: string;
  /** True when both screens should render the authored A6 panel PNG. */
  readonly usePanelArt: boolean;
};

/** Player-facing weapon name for an A6 NPC bake (overrides catalogue when needed). */
const A6_NPC_WEAPON_LABEL: Partial<Readonly<Record<A6OpponentNpcId, string>>> = {
  // Boat-hook identity — kit/combat maps spear; tape must not say Spear.
  'can-hook': 'Hook',
};

/** Catalogue ids for an A6 bake (cobalt visual → paint-navy). */
export function a6BakeCatalogueLoadout(bake: A6OpponentBake): {
  paintId: string;
  weaponId: string;
} {
  return {
    paintId: paintCatalogueId(bake.paint),
    weaponId: weaponCatalogueId(bake.weapon),
  };
}

function labelsFor(paintId: string, weaponId: string, npcId: A6OpponentNpcId | null) {
  return {
    paintLabel: paintDisplayLabel(paintId),
    weaponLabel: (npcId && A6_NPC_WEAPON_LABEL[npcId]) || weaponDisplayLabel(weaponId),
  };
}

/** Shared presentation for Opponents card and Confirm Fight / ToTT face-off. */
export function resolveOpponentPresentation(
  input: OpponentPresentationInput,
): OpponentPresentation {
  const npcId = resolveOpponentNpcId(input.characterId) ?? resolveOpponentNpcId(input.displayName);
  if (!npcId) {
    const paintId = input.paintId;
    const weaponId = input.weaponId;
    return {
      npcId: null,
      paintId,
      weaponId,
      usePanelArt: false,
      ...labelsFor(paintId, weaponId, null),
    };
  }
  const bake = A6_OPPONENT_BAKES[npcId];
  const { paintId, weaponId } = a6BakeCatalogueLoadout(bake);
  return {
    npcId,
    paintId,
    weaponId,
    usePanelArt: true,
    ...labelsFor(paintId, weaponId, npcId),
  };
}

/** Bake tile ids for tests / capture assertions. */
export function a6NpcBakeTiles(npcId: A6OpponentNpcId): {
  paint: A6PaintTileId;
  weapon: A6WeaponTileId;
} {
  return A6_OPPONENT_BAKES[npcId];
}
