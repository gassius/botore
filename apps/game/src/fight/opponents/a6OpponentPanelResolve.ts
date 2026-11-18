import { resolveOpponentPresentation } from '../../garage-tag/a6OpponentPresentation';

/**
 * Resolve A6 opponent panel slug via the shared Opponents/ToTT presentation
 * resolver (exact A6 NPC identity → authored bake + panel).
 */
export function resolveA6OpponentPanelSlug(input: {
  characterId?: string | null;
  displayName?: string | null;
  paintId?: string | null;
  weaponId?: string | null;
}): string | null {
  const presentation = resolveOpponentPresentation({
    characterId: input.characterId ?? '',
    displayName: input.displayName ?? '',
    paintId: input.paintId ?? '',
    weaponId: input.weaponId ?? '',
  });
  return presentation.usePanelArt ? presentation.npcId : null;
}
