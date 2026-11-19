import type { GarageLoadout, OwnedBotSummary } from './loadoutTypes';

/**
 * Immediate Ludus card patch after Equip — ownedBots is what the carousel
 * reads; waiting solely on list_owned_characters can leave paint/weapon/shapes
 * stale until the player switches bots (which re-hydrates).
 */
export function applyLoadoutToOwnedBots(
  bots: readonly OwnedBotSummary[],
  characterId: string,
  loadout: Pick<GarageLoadout, 'paint' | 'weapon' | 'head' | 'body' | 'arms' | 'legs'>,
  atlasVersion: string | null,
): OwnedBotSummary[] {
  return bots.map((bot) =>
    bot.characterId !== characterId
      ? bot
      : {
          ...bot,
          paint: loadout.paint,
          weapon: loadout.weapon,
          head: loadout.head,
          body: loadout.body,
          arms: loadout.arms,
          legs: loadout.legs,
          atlasVersion: atlasVersion ?? bot.atlasVersion,
        },
  );
}

/** Immediate nameplate patch after rename_owned_character. */
export function applyDisplayNameToOwnedBots(
  bots: readonly OwnedBotSummary[],
  characterId: string,
  displayName: string,
): OwnedBotSummary[] {
  return bots.map((bot) => (bot.characterId !== characterId ? bot : { ...bot, displayName }));
}
