/**
 * Ranking row portrait — ShapeKit head+paint (and full A4 loadout) via BotPortrait.
 * Never a static stock helmet PNG; every row uses equipped shapes when present.
 */
import React, { useMemo } from 'react';
import type { AssemblerLoadoutInput } from '../assembler';
import { BotPortrait } from '../portrait/BotPortrait';
import type { RankingPortraitParts } from './types';

export type RankingPortraitProps = {
  readonly paintId?: string | null;
  /** Full portrait parts from list_bot_ranking (preferred over paintId alone). */
  readonly portrait?: RankingPortraitParts | null;
  /** Display edge length in pt (mockup ~46). */
  readonly size?: number;
  readonly testID?: string;
};

function loadoutFromPortrait(
  portrait: RankingPortraitParts | null | undefined,
  paintFallback: string | null | undefined,
): AssemblerLoadoutInput {
  const paint = portrait?.paint ?? paintFallback ?? 'paint-crimson';
  return {
    chassis: portrait?.chassis ?? 'chassis-basic',
    paint,
    weapon: portrait?.weapon ?? 'weapon-sword',
    head: portrait?.head ?? null,
    body: portrait?.body ?? null,
    arms: portrait?.arms ?? null,
    legs: portrait?.legs ?? null,
  };
}

export function RankingPortrait({
  paintId,
  portrait,
  size = 46,
  testID = 'ranking-portrait',
}: RankingPortraitProps): React.ReactElement {
  const loadout = useMemo(
    () => loadoutFromPortrait(portrait, paintId),
    [portrait, paintId],
  );
  return (
    <BotPortrait loadout={loadout} paintId={loadout.paint} size={size} testID={testID} />
  );
}
