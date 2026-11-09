/**
 * Pure mapping: replay animation command → trial audio clip.
 * Headless-safe; never loads or plays audio.
 */
import type { AnimationCommand } from '../replay-playback';
import type { TrialAudioClipId } from './trialAudioPin';

/** One-shot SFX derived from a compiled animation command (may be null). */
export function sfxClipFromCommand(cmd: AnimationCommand): TrialAudioClipId | null {
  switch (cmd.kind) {
    case 'show_battle':
      return 'hush';
    case 'attack_anim':
      return 'swing';
    case 'dodge_anim':
      return 'dodge';
    case 'damage_pop':
      return 'hit';
    case 'defeat_anim':
      return 'defeat';
    case 'victory_screen':
      // Guidelines: win stinger only on battle_ended (win).
      return cmd.winner != null ? 'win' : null;
    case 'turn_banner':
      return null;
  }
}

/** Fight music loop starts with the arena / show_battle beat. */
export function shouldStartMusicLoop(cmd: AnimationCommand): boolean {
  return cmd.kind === 'show_battle';
}

/** Stop looping music when the recorded fight ends. */
export function shouldStopMusicLoop(cmd: AnimationCommand): boolean {
  return cmd.kind === 'victory_screen';
}
