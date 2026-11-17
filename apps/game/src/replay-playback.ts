/**
 * Replay-driven animation queue / state machine.
 *
 * FRAMEWORK-FREE CORE: this file contains no Cocos imports so it can be unit
 * tested headlessly. The BattleReplayController (cocos adapter) executes the
 * emitted commands against real nodes.
 *
 * The renderer NEVER decides gameplay: it only visualizes the canonical
 * event stream from @botore/replay.
 *
 * A2: attack / dodge / knockout / walk-in expand from kit-v003.1
 * `manifest.timing` (30 fps). Audio markers ride on those frames — not
 * hard-coded ms — so in-betweens stay in sync when the next kit pass lands.
 */
import { type BattleEvent, type BattleReplay, validateReplay } from '@botore/replay';
import type { KitWeaponKind } from './assembler/workshopFrameTypes';
import {
  A2_FPS,
  expandWeaponSequence,
  framesToMs,
  type FightAudioMarker,
  type FightTimelineBeat,
} from './fight/a2FightTimeline';

export type AnimationCommand =
  | { readonly kind: 'show_battle'; readonly attacker: string; readonly defender: string }
  | { readonly kind: 'turn_banner'; readonly actor: string }
  | {
      readonly kind: 'attack_anim';
      readonly actor: string;
      readonly attack: 'basic' | 'weapon';
      /**
       * Presentation beat for sealed weapon (heavy) attacks only.
       * Kept for C11 / legacy callers; A2 compile prefers `motion_beat`.
       */
      readonly heavyPhase?: 'windup' | 'strike';
    }
  | { readonly kind: 'dodge_anim'; readonly actor: string }
  | {
      readonly kind: 'damage_pop';
      readonly target: string;
      readonly amount: number;
      readonly hpAfter: number;
    }
  | { readonly kind: 'defeat_anim'; readonly characterId: string }
  | { readonly kind: 'victory_screen'; readonly winner: string | null }
  | {
      /** A2 kit timing beat — pose + frames + optional SFX markers. */
      readonly kind: 'motion_beat';
      readonly actor: string;
      readonly poseKey: string;
      readonly frames: number;
      readonly markers: readonly FightAudioMarker[];
      readonly hitStop?: boolean;
      /** During hit-stop, freeze the victim on this pose (usually hit_react). */
      readonly victimId?: string;
      readonly victimPoseKey?: string;
      /** Optional FX capture family on the first beat of dodge/defeat. */
      readonly fxFamily?: 'hit' | 'dodge' | 'defeat';
    };

export type CompileAnimationQueueOptions = {
  readonly reducedMotion?: boolean;
};

function weaponKindFor(replay: BattleReplay, characterId: string): KitWeaponKind {
  const fighter = replay.fighters.find((f) => f.characterId === characterId);
  const kind = fighter?.weaponKind;
  if (kind === 'axe' || kind === 'dagger' || kind === 'sword') return kind;
  return 'sword';
}

function opponentOf(replay: BattleReplay, actorId: string): string | null {
  const ids = replay.fighters.map((f) => f.characterId);
  return ids.find((id) => id !== actorId) ?? null;
}

/**
 * Lookahead: after `attack_selected`, does the sealed stream record a connect
 * (`damage_applied`) or a whiff (`dodged`) before the next attack/turn/end?
 */
function attackHitConnects(events: readonly BattleEvent[], fromIndex: number): boolean {
  for (let i = fromIndex + 1; i < events.length; i += 1) {
    const ev = events[i]!;
    if (ev.type === 'damage_applied') return true;
    if (ev.type === 'dodged') return false;
    if (
      ev.type === 'attack_selected' ||
      ev.type === 'turn_started' ||
      ev.type === 'character_defeated' ||
      ev.type === 'battle_ended'
    ) {
      break;
    }
  }
  // No dodge recorded → treat as connect (damage may be absent on edge fixtures).
  return true;
}

function pushBeats(
  queue: AnimationCommand[],
  actor: string,
  beats: readonly FightTimelineBeat[],
  extras: {
    readonly victimId?: string;
    readonly victimPoseKey?: string;
    readonly fxOnFirst?: 'dodge' | 'defeat';
  } = {},
): void {
  beats.forEach((beat, index) => {
    const victimId = beat.hitStop ? extras.victimId : undefined;
    const victimPoseKey = beat.hitStop ? extras.victimPoseKey : undefined;
    queue.push({
      kind: 'motion_beat',
      actor,
      poseKey: beat.poseKey,
      frames: beat.frames,
      markers: beat.markers,
      ...(beat.hitStop ? { hitStop: true } : {}),
      ...(victimId ? { victimId } : {}),
      ...(victimPoseKey ? { victimPoseKey } : {}),
      ...(index === 0 && extras.fxOnFirst ? { fxFamily: extras.fxOnFirst } : {}),
    });
  });
}

/** Duration weights consumed by the adapter's scheduler. A2 beats use kit fps. */
export function commandDuration(cmd: AnimationCommand): number {
  switch (cmd.kind) {
    case 'show_battle':
      return 0;
    case 'turn_banner':
      return 250;
    case 'attack_anim':
      // Legacy fallback when a caller still emits coarse attack_anim.
      if (cmd.attack === 'weapon' && cmd.heavyPhase === 'windup') return 280;
      if (cmd.attack === 'weapon') return 420;
      return 400;
    case 'dodge_anim':
      return 0;
    case 'damage_pop':
      // HP/FX tick only — hit SFX + hit_react pose ride the attack hit-stop beat.
      return 120;
    case 'defeat_anim':
      return 0;
    case 'victory_screen':
      return 800;
    case 'motion_beat':
      return framesToMs(cmd.frames, A2_FPS);
  }
}

/**
 * Compiles a validated replay into an ordered animation queue.
 * Throws when the payload fails schema validation (fail closed).
 */
export function compileAnimationQueue(
  rawReplay: unknown,
  opts: CompileAnimationQueueOptions = {},
): AnimationCommand[] {
  const replay: BattleReplay = validateReplay(rawReplay);
  const queue: AnimationCommand[] = [];
  const reducedMotion = Boolean(opts.reducedMotion);

  const started = replay.events[0];
  if (started && started.type === 'battle_started') {
    queue.push({ kind: 'show_battle', attacker: started.attacker, defender: started.defender });
    // One walk-in cycle per fighter (kit art); root translation lands with D1.
    for (const fighter of replay.fighters) {
      const weapon = weaponKindFor(replay, fighter.characterId);
      const walk = expandWeaponSequence(weapon, 'walk_in', { reducedMotion });
      pushBeats(queue, fighter.characterId, walk);
    }
  }

  const events = replay.events as readonly BattleEvent[];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i]!;
    switch (ev.type) {
      case 'battle_started':
        break;
      case 'turn_started':
        queue.push({ kind: 'turn_banner', actor: ev.actor });
        break;
      case 'attack_selected': {
        const weapon = weaponKindFor(replay, ev.actor);
        const hitConnects = attackHitConnects(events, i);
        const victimId = opponentOf(replay, ev.actor);
        const beats = expandWeaponSequence(weapon, 'attack', { hitConnects, reducedMotion });
        pushBeats(queue, ev.actor, beats, {
          ...(victimId ? { victimId, victimPoseKey: 'hit_react' } : {}),
        });
        break;
      }
      case 'dodged': {
        const weapon = weaponKindFor(replay, ev.actor);
        const beats = expandWeaponSequence(weapon, 'dodge', { reducedMotion });
        pushBeats(queue, ev.actor, beats, { fxOnFirst: 'dodge' });
        // Keep a zero-duration dodge_anim so older FX helpers still see the kind
        // if no motion_beat.fxFamily is read — primary path uses fxFamily.
        break;
      }
      case 'damage_applied':
        queue.push({
          kind: 'damage_pop',
          target: ev.target,
          amount: ev.amount,
          hpAfter: ev.targetHpAfter,
        });
        break;
      case 'character_defeated': {
        const weapon = weaponKindFor(replay, ev.characterId);
        const beats = expandWeaponSequence(weapon, 'knockout', { reducedMotion });
        pushBeats(queue, ev.characterId, beats, { fxOnFirst: 'defeat' });
        break;
      }
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
