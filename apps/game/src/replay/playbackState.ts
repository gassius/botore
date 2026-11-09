/**
 * Pure mapping from animation commands → presentation state.
 * No client combat decisions; FX families bind only to recorded event kinds.
 */
import type { AnimationCommand } from '../replay-playback';
import type { MotionPose } from '../assembler';
import type { FxFamily } from '../arena';

export interface FighterPresentation {
  readonly characterId: string;
  readonly motionPose: MotionPose;
}

export interface ReplayPresentationState {
  readonly near: FighterPresentation;
  readonly far: FighterPresentation;
  readonly banner: string;
  readonly hp: { readonly near: number; readonly far: number };
  readonly activeFx: readonly {
    readonly family: FxFamily;
    readonly targetSlot: 'near' | 'far' | 'contact';
    readonly cueKey: string;
  }[];
  readonly finished: boolean;
  readonly winnerId: string | null;
  readonly showResult: boolean;
}

export function initialPresentationState(nearId: string, farId: string): ReplayPresentationState {
  return {
    near: { characterId: nearId, motionPose: 'idle' },
    far: { characterId: farId, motionPose: 'idle' },
    banner: '',
    hp: { near: 1, far: 1 },
    activeFx: [],
    finished: false,
    winnerId: null,
    showResult: false,
  };
}

function slotFor(characterId: string, _nearId: string, farId: string): 'near' | 'far' {
  return characterId === farId ? 'far' : 'near';
}

function withPose(
  state: ReplayPresentationState,
  characterId: string,
  pose: MotionPose,
): ReplayPresentationState {
  if (state.near.characterId === characterId) {
    return { ...state, near: { ...state.near, motionPose: pose } };
  }
  if (state.far.characterId === characterId) {
    return { ...state, far: { ...state.far, motionPose: pose } };
  }
  return state;
}

/** Normalize absolute targetHpAfter from sealed replay against starting HP. */
export function normalizeHpAfter(hpAfter: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, hpAfter / maxHp));
}

/**
 * Apply one animation command. Identical command streams → identical states.
 * Hit FX only from damage_pop; dodge FX only from dodge_anim; defeat only from defeat_anim.
 */
export function applyAnimationCommand(
  state: ReplayPresentationState,
  cmd: AnimationCommand,
  cueSeq: number,
  maxHp: { readonly near: number; readonly far: number },
): ReplayPresentationState {
  switch (cmd.kind) {
    case 'show_battle':
      return initialPresentationState(state.near.characterId, state.far.characterId);
    case 'turn_banner':
      return { ...state, banner: cmd.actor, activeFx: [] };
    case 'attack_anim':
      return { ...withPose(state, cmd.actor, 'attack'), activeFx: [] };
    case 'dodge_anim': {
      const slot = slotFor(cmd.actor, state.near.characterId, state.far.characterId);
      return {
        ...withPose(state, cmd.actor, 'dodge'),
        activeFx: [{ family: 'dodge', targetSlot: slot, cueKey: `dodge-${cueSeq}` }],
      };
    }
    case 'damage_pop': {
      const slot = slotFor(cmd.target, state.near.characterId, state.far.characterId);
      const max = slot === 'near' ? maxHp.near : maxHp.far;
      const ratio = normalizeHpAfter(cmd.hpAfter, max);
      return {
        ...withPose(state, cmd.target, 'hit'),
        hp: slot === 'near' ? { ...state.hp, near: ratio } : { ...state.hp, far: ratio },
        activeFx: [{ family: 'hit', targetSlot: 'contact', cueKey: `hit-${cueSeq}` }],
      };
    }
    case 'defeat_anim': {
      const slot = slotFor(cmd.characterId, state.near.characterId, state.far.characterId);
      return {
        ...withPose(state, cmd.characterId, 'defeat'),
        activeFx: [{ family: 'defeat', targetSlot: slot, cueKey: `defeat-${cueSeq}` }],
      };
    }
    case 'victory_screen':
      return {
        ...state,
        activeFx: [],
        finished: true,
        showResult: true,
        winnerId: cmd.winner,
      };
  }
}
