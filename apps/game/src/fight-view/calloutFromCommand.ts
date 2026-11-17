/**
 * Player-facing event call-outs for the Fight View bottom band.
 * Driven only by recorded animation commands — never invents combat outcomes.
 */
import type { AnimationCommand } from '../replay-playback';
import { fighterDisplayName } from '../replay/confirmedResult';
import type { FightViewCallout } from './types';

type NamedFighter = { readonly characterId: string; readonly displayName: string };

function nameOf(characterId: string, fighters: readonly NamedFighter[]): string {
  return fighterDisplayName(characterId, fighters);
}

/**
 * Map the latest animation command to a short call-out plate.
 * Returns null when the band should stay empty (no dev text).
 */
export function calloutFromCommand(
  cmd: AnimationCommand | null | undefined,
  fighters: readonly NamedFighter[],
  opts?: { readonly lastAttackerId?: string | null; readonly wasHeavy?: boolean },
): FightViewCallout | null {
  if (!cmd) return null;

  switch (cmd.kind) {
    case 'attack_anim': {
      if (cmd.attack === 'weapon' && cmd.heavyPhase === 'strike') {
        const actor = nameOf(cmd.actor, fighters);
        // Strike phase is not a confirmed hit — keep "Heavy hit!" for damage_pop only.
        return {
          headline: 'Heavy strike!',
          detail: `${actor} unleashes a heavy strike`,
        };
      }
      if (cmd.attack === 'weapon' && cmd.heavyPhase === 'windup') {
        return {
          headline: 'Heavy windup',
          detail: `${nameOf(cmd.actor, fighters)} charges a heavy`,
        };
      }
      return {
        headline: 'Strike!',
        detail: `${nameOf(cmd.actor, fighters)} swings`,
      };
    }
    case 'damage_pop': {
      const target = nameOf(cmd.target, fighters);
      const attackerId = opts?.lastAttackerId;
      const attacker = attackerId ? nameOf(attackerId, fighters) : null;
      if (opts?.wasHeavy) {
        return {
          headline: 'Heavy hit!',
          detail: attacker
            ? `${attacker}'s weapon lands — ${target} staggers`
            : `${target} takes a heavy hit`,
        };
      }
      return {
        headline: 'Hit!',
        detail: attacker ? `${attacker} lands a hit on ${target}` : `${target} takes a hit`,
      };
    }
    case 'dodge_anim':
      return {
        headline: 'Dodge!',
        detail: `${nameOf(cmd.actor, fighters)} slips aside`,
      };
    case 'defeat_anim':
      return {
        headline: 'KO!',
        detail: `${nameOf(cmd.characterId, fighters)} is down`,
      };
    case 'victory_screen':
      return null;
    case 'show_battle':
    case 'turn_banner':
    default:
      return null;
  }
}

/** Track last attacker + heavy flag across the command stream for damage call-outs. */
export function updateCalloutAttackContext(
  cmd: AnimationCommand,
  prev: { readonly lastAttackerId: string | null; readonly wasHeavy: boolean },
): { readonly lastAttackerId: string | null; readonly wasHeavy: boolean } {
  if (cmd.kind === 'attack_anim') {
    return {
      lastAttackerId: cmd.actor,
      wasHeavy: cmd.attack === 'weapon',
    };
  }
  if (cmd.kind === 'damage_pop' || cmd.kind === 'dodge_anim' || cmd.kind === 'defeat_anim') {
    return prev;
  }
  return { lastAttackerId: null, wasHeavy: false };
}
