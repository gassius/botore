/**
 * Pure mapping: replay animation command → trial audio clip(s).
 * Headless-safe; never loads or plays audio.
 *
 * A2: fight SFX ride pose/frame markers on `motion_beat` (swing @ first strike,
 * hit @ first hit-stop, dodge @ first dodge, defeat @ first knockout / fall).
 * Coarse attack/dodge/defeat commands no longer emit those clips.
 */
import type { AnimationCommand } from '../replay-playback';
import type { TrialAudioClipId } from './trialAudioPin';

const MARKER_TO_CLIP: Readonly<Record<string, TrialAudioClipId>> = {
  swing: 'swing',
  hit: 'hit',
  dodge: 'dodge',
  defeat: 'defeat',
};

/** All one-shot SFX derived from a compiled animation command (may be empty). */
export function sfxClipsFromCommand(cmd: AnimationCommand): readonly TrialAudioClipId[] {
  switch (cmd.kind) {
    case 'show_battle':
      return ['hush'];
    case 'motion_beat':
      return cmd.markers
        .map((m) => MARKER_TO_CLIP[m])
        .filter((id): id is TrialAudioClipId => id != null);
    case 'attack_anim':
      // Legacy coarse path (tests / old queues). A2 compile uses motion_beat.
      if (cmd.attack === 'weapon' && cmd.heavyPhase === 'windup') return [];
      return ['swing'];
    case 'dodge_anim':
      return [];
    case 'damage_pop':
      // Hit clank fires on the attack hit-stop frame marker, not the HP pop.
      return [];
    case 'defeat_anim':
      return [];
    case 'victory_screen':
      return cmd.winner != null ? ['win'] : [];
    case 'turn_banner':
      return [];
  }
}

/** One-shot SFX derived from a compiled animation command (may be null). */
export function sfxClipFromCommand(cmd: AnimationCommand): TrialAudioClipId | null {
  return sfxClipsFromCommand(cmd)[0] ?? null;
}

/** Fight music loop starts with the arena / show_battle beat. */
export function shouldStartMusicLoop(cmd: AnimationCommand): boolean {
  return cmd.kind === 'show_battle';
}

/** Stop looping music when the recorded fight ends. */
export function shouldStopMusicLoop(cmd: AnimationCommand): boolean {
  return cmd.kind === 'victory_screen';
}
