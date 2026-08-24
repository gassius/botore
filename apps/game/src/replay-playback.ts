/**
 * Replay-driven animation queue / state machine.
 *
 * FRAMEWORK-FREE CORE: this file contains no Cocos imports so it can be unit
 * tested headlessly. The BattleReplayController (cocos adapter) executes the
 * emitted commands against real nodes.
 *
 * The renderer NEVER decides gameplay: it only visualizes the canonical
 * event stream from @botore/replay.
 */
import { type BattleEvent, type BattleReplay, validateReplay } from '@botore/replay';

export type AnimationCommand =
  | { readonly kind: 'show_battle'; readonly attacker: string; readonly defender: string }
  | { readonly kind: 'turn_banner'; readonly actor: string }
  | { readonly kind: 'attack_anim'; readonly actor: string; readonly attack: 'basic' | 'weapon' }
  | { readonly kind: 'dodge_anim'; readonly actor: string }
  | { readonly kind: 'damage_pop'; readonly target: string; readonly amount: number; readonly hpAfter: number }
  | { readonly kind: 'defeat_anim'; readonly characterId: string }
  | { readonly kind: 'victory_screen'; readonly winner: string | null };

/** Duration weights (arbitrary units) consumed by the adapter's scheduler. */
export function commandDuration(cmd: AnimationCommand): number {
  switch (cmd.kind) {
    case 'show_battle':
      return 500;
    case 'turn_banner':
      return 250;
    case 'attack_anim':
      return 400;
    case 'dodge_anim':
      return 300;
    case 'damage_pop':
      return 450;
    case 'defeat_anim':
      return 600;
    case 'victory_screen':
      return 800;
  }
}

/**
 * Compiles a validated replay into an ordered animation queue.
 * Throws when the payload fails schema validation (fail closed).
 */
export function compileAnimationQueue(rawReplay: unknown): AnimationCommand[] {
  const replay: BattleReplay = validateReplay(rawReplay);
  const queue: AnimationCommand[] = [];

  const started = replay.events[0];
  if (started && started.type === 'battle_started') {
    queue.push({ kind: 'show_battle', attacker: started.attacker, defender: started.defender });
  }

  for (const ev of replay.events as readonly BattleEvent[]) {
    switch (ev.type) {
      case 'battle_started':
        break; // already queued
      case 'turn_started':
        queue.push({ kind: 'turn_banner', actor: ev.actor });
        break;
      case 'attack_selected':
        queue.push({ kind: 'attack_anim', actor: ev.actor, attack: ev.attack });
        break;
      case 'dodged':
        queue.push({ kind: 'dodge_anim', actor: ev.actor });
        break;
      case 'damage_applied':
        queue.push({
          kind: 'damage_pop',
          target: ev.target,
          amount: ev.amount,
          hpAfter: ev.targetHpAfter,
        });
        break;
      case 'character_defeated':
        queue.push({ kind: 'defeat_anim', characterId: ev.characterId });
        break;
      case 'battle_ended':
        queue.push({ kind: 'victory_screen', winner: ev.winner });
        break;
    }
  }
  return queue;
}

/** Minimal deterministic playback state machine over the compiled queue. */
export class PlaybackController {
  private index = 0;

  constructor(private readonly queue: readonly AnimationCommand[]) {}

  get total(): number {
    return this.queue.length;
  }

  get position(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.index >= this.queue.length;
  }

  current(): AnimationCommand | null {
    return this.queue[this.index] ?? null;
  }

  advance(): AnimationCommand | null {
    const cmd = this.queue[this.index] ?? null;
    if (cmd) this.index += 1;
    return cmd;
  }

  reset(): void {
    this.index = 0;
  }
}
