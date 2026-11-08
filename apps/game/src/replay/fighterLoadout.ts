/**
 * Map sealed replay fighter snapshots → BotAssembler loadout input.
 * Paint aliases follow scene slots (near=oxide, far=petrol) unless a stored
 * historical build supplies catalogue paints later.
 */
import type { FighterSnapshot } from '@botore/replay';
import type { AssemblerLoadoutInput } from '../assembler';
import type { PlacedActor } from '../arena';

export function loadoutFromFighter(
  fighter: FighterSnapshot,
  placement: PlacedActor,
): AssemblerLoadoutInput {
  const paint = placement.paintAlias === 'petrol' ? 'paint-cobalt' : 'paint-crimson';
  const weapon =
    fighter.weaponKind === 'axe'
      ? 'weapon-axe'
      : fighter.weaponKind === 'dagger'
        ? 'weapon-dagger'
        : 'weapon-sword';
  return {
    chassis: 'chassis-basic',
    paint,
    weapon,
  };
}
