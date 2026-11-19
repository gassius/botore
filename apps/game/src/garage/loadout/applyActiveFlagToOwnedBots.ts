import type { OwnedBotSummary } from './loadoutTypes';

/**
 * Optimistic Ludus active flag after carousel select — marks one bot active
 * immediately so Find opponent / header identity track the focused card while
 * select_active_character + hydrate settle.
 */
export function applyActiveFlagToOwnedBots(
  bots: readonly OwnedBotSummary[],
  characterId: string,
): OwnedBotSummary[] {
  return bots.map((bot) => ({
    ...bot,
    isActive: bot.characterId === characterId,
  }));
}
