/**
 * Map sealed build sound tags / part ids → trial part-audio cue ids.
 * Headless-safe; never loads or plays audio.
 *
 * Preference (docs/audio/README.md): part clip first, base swing/hit fallback.
 */
import type { AnimationCommand } from '../replay-playback';
import type { SealedBotBuild } from '../replay/fighterLoadout';

export const PART_AUDIO_CUE_IDS = [
  'weaponSwordSwing',
  'weaponAxeSwing',
  'weaponDaggerSwing',
  'chassisBasicHit',
] as const;

export type PartAudioCueId = (typeof PART_AUDIO_CUE_IDS)[number];

/** Arena ambient loop volume on the Music channel (Audio Director guidance). */
export const ARENA_AMBIENT_VOLUME = 0.3;

export type FighterAudioProfile = {
  readonly characterId: string;
  readonly weaponSwingCue: PartAudioCueId | null;
  readonly chassisHitCue: PartAudioCueId | null;
};

export type ResolvedOneShotCue =
  | { readonly kind: 'part'; readonly id: PartAudioCueId }
  | {
      readonly kind: 'base';
      readonly id: 'swing' | 'hit' | 'dodge' | 'defeat' | 'hush' | 'uiTap' | 'win';
    };

function tagsOf(build: Pick<SealedBotBuild, 'soundTags'> | null | undefined): readonly string[] {
  return build?.soundTags ?? [];
}

export function weaponSwingCueFromBuild(
  build: Pick<SealedBotBuild, 'weapon' | 'soundTags'> | null | undefined,
): PartAudioCueId | null {
  if (!build) return null;
  const tags = tagsOf(build);
  if (tags.includes('weapon.axe') || build.weapon === 'weapon-axe' || build.weapon === 'axe') {
    return 'weaponAxeSwing';
  }
  if (
    tags.includes('weapon.dagger') ||
    build.weapon === 'weapon-dagger' ||
    build.weapon === 'dagger'
  ) {
    return 'weaponDaggerSwing';
  }
  if (
    tags.includes('weapon.sword') ||
    build.weapon === 'weapon-sword' ||
    build.weapon === 'sword'
  ) {
    return 'weaponSwordSwing';
  }
  return null;
}

export function chassisHitCueFromBuild(
  build: Pick<SealedBotBuild, 'chassis' | 'soundTags'> | null | undefined,
): PartAudioCueId | null {
  if (!build) return null;
  const tags = tagsOf(build);
  if (
    tags.includes('chassis.light') ||
    tags.includes('chassis.heavy') ||
    build.chassis === 'chassis-basic' ||
    (build.chassis?.startsWith('chassis-') ?? false)
  ) {
    return 'chassisBasicHit';
  }
  return null;
}

export function fighterAudioProfile(
  characterId: string,
  build: SealedBotBuild | null | undefined,
): FighterAudioProfile {
  return {
    characterId,
    weaponSwingCue: weaponSwingCueFromBuild(build),
    chassisHitCue: chassisHitCueFromBuild(build),
  };
}

export function profilesFromFightBuilds(input: {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly attacker: SealedBotBuild;
  readonly defender: SealedBotBuild;
}): readonly FighterAudioProfile[] {
  return [
    fighterAudioProfile(input.attackerId, input.attacker),
    fighterAudioProfile(input.defenderId, input.defender),
  ];
}

function profileFor(
  profiles: readonly FighterAudioProfile[],
  characterId: string,
): FighterAudioProfile | undefined {
  return profiles.find((p) => p.characterId === characterId);
}

function cueForMotionMarker(
  cmd: Extract<AnimationCommand, { kind: 'motion_beat' }>,
  marker: string,
  profiles: readonly FighterAudioProfile[],
): ResolvedOneShotCue | null {
  switch (marker) {
    case 'swing': {
      const part = profileFor(profiles, cmd.actor)?.weaponSwingCue;
      if (part) return { kind: 'part', id: part };
      return { kind: 'base', id: 'swing' };
    }
    case 'hit': {
      const targetId = cmd.victimId ?? cmd.actor;
      const part = profileFor(profiles, targetId)?.chassisHitCue;
      if (part) return { kind: 'part', id: part };
      return { kind: 'base', id: 'hit' };
    }
    case 'dodge':
      return { kind: 'base', id: 'dodge' };
    case 'defeat':
      return { kind: 'base', id: 'defeat' };
    default:
      return null;
  }
}

/**
 * Resolve all one-shot cues for a command.
 * A2: fight SFX ride `motion_beat` frame markers; coarse dodge/damage/defeat
 * commands no longer emit clips (still typed for legacy callers).
 */
export function resolveOneShotCues(
  cmd: AnimationCommand,
  profiles: readonly FighterAudioProfile[] = [],
): readonly ResolvedOneShotCue[] {
  switch (cmd.kind) {
    case 'show_battle':
      return [{ kind: 'base', id: 'hush' }];
    case 'motion_beat': {
      const cues: ResolvedOneShotCue[] = [];
      for (const marker of cmd.markers) {
        const cue = cueForMotionMarker(cmd, marker, profiles);
        if (cue) cues.push(cue);
      }
      return cues;
    }
    case 'attack_anim': {
      // Legacy coarse path (tests / old queues). A2 compile uses motion_beat.
      if (cmd.attack === 'weapon' && cmd.heavyPhase === 'windup') return [];
      const part = profileFor(profiles, cmd.actor)?.weaponSwingCue;
      if (part) return [{ kind: 'part', id: part }];
      return [{ kind: 'base', id: 'swing' }];
    }
    case 'dodge_anim':
    case 'damage_pop':
    case 'defeat_anim':
      return [];
    case 'victory_screen':
      return cmd.winner != null ? [{ kind: 'base', id: 'win' }] : [];
    case 'turn_banner':
      return [];
  }
}

/** First one-shot cue for a command (may be null). */
export function resolveOneShotCue(
  cmd: AnimationCommand,
  profiles: readonly FighterAudioProfile[] = [],
): ResolvedOneShotCue | null {
  return resolveOneShotCues(cmd, profiles)[0] ?? null;
}

export function shouldStartAmbientLoop(cmd: AnimationCommand): boolean {
  return cmd.kind === 'show_battle';
}

export function shouldStopAmbientLoop(cmd: AnimationCommand): boolean {
  return cmd.kind === 'victory_screen';
}
