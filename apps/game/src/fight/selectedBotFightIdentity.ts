import { playerFacingDisplayName } from '../identity/platformPlayerId';
import type { SealedFightBuildSnapshot } from './request/types';

type NamedFighter = {
  readonly characterId: string;
  readonly displayName?: string;
};

/**
 * Near-side Fight View header label for the player's bot.
 * Prefer sealed replay fighter names; fall back to the Ludus-selected display name.
 */
export function selectedBotFightHeaderName(input: {
  readonly selectedDisplayName: string | null | undefined;
  readonly fighters: readonly NamedFighter[];
}): string {
  const attacker = input.fighters[0];
  if (attacker) {
    return playerFacingDisplayName(attacker.displayName);
  }
  return playerFacingDisplayName(input.selectedDisplayName);
}

/**
 * True when the sealed replay attacker matches the Ludus-selected character.
 * Used so unit tests fail if fight request / header / record diverge from select.
 */
export function selectedBotMatchesFightAttacker(input: {
  readonly selectedCharacterId: string | null | undefined;
  readonly replayAttackerCharacterId: string | null | undefined;
}): boolean {
  const selected = (input.selectedCharacterId ?? '').trim();
  const attacker = (input.replayAttackerCharacterId ?? '').trim();
  if (!selected || !attacker) return false;
  return selected === attacker;
}

/** Attach characterId on sealed builds so client identity can be asserted. */
export function sealedBuildWithCharacterId(
  build: SealedFightBuildSnapshot,
  characterId: string | null | undefined,
): SealedFightBuildSnapshot & { readonly characterId?: string } {
  const id = (characterId ?? '').trim();
  if (!id) return build;
  return { ...build, characterId: id };
}

export function readReplayAttackerId(replay: unknown): string | null {
  if (!replay || typeof replay !== 'object') return null;
  const fighters = (replay as { fighters?: unknown }).fighters;
  if (!Array.isArray(fighters) || fighters.length < 1) return null;
  const first = fighters[0];
  if (!first || typeof first !== 'object') return null;
  const id = (first as { characterId?: unknown }).characterId;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
}

export function readReplayAttackerDisplayName(replay: unknown): string | null {
  if (!replay || typeof replay !== 'object') return null;
  const fighters = (replay as { fighters?: unknown }).fighters;
  if (!Array.isArray(fighters) || fighters.length < 1) return null;
  const first = fighters[0];
  if (!first || typeof first !== 'object') return null;
  const name = (first as { displayName?: unknown }).displayName;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}
