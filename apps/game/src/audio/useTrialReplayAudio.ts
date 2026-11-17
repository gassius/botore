/**
 * Hook that binds a TrialAudioSession to CanonicalReplayPlayer lifecycle.
 * Failures never surface to the fight clock.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AnimationCommand } from '../replay-playback';
import type { SealedFightBuilds } from '../replay/fighterLoadout';
import { createExpoAvBackend } from './expoAvBackend';
import {
  createTrialAudioSession,
  type PlayCueOptions,
  type TrialAudioSession,
} from './TrialAudioSession';
import { TRIAL_AUDIO_METRO_SOURCES } from './trialAudioMetroAssets';
import {
  TRIAL_AMBIENT_METRO_SOURCE,
  TRIAL_PART_AUDIO_METRO_SOURCES,
} from './trialPartAudioMetroAssets';
import { profilesFromFightBuilds } from './partAudioResolve';
import type { TrialAudioUiCueId } from './trialAudioPin';

export type TrialReplayAudioApi = {
  onCommand: (cmd: AnimationCommand) => void;
  playUiTap: () => void;
  playCue: (id: TrialAudioUiCueId, options?: PlayCueOptions) => void;
  reset: () => void;
};

export function useTrialReplayAudio(opts: {
  muted: boolean;
  musicEnabled?: boolean;
  effectsEnabled?: boolean;
  playing: boolean;
  enabled?: boolean;
  /** Attacker / defender character ids from the sealed replay. */
  attackerId?: string;
  defenderId?: string;
  /** Sealed builds for part-tagged swing / chassis hit. */
  builds?: SealedFightBuilds;
}): TrialReplayAudioApi {
  const sessionRef = useRef<TrialAudioSession | null>(null);
  const mutedRef = useRef(opts.muted);
  const musicEnabledRef = useRef(opts.musicEnabled !== false);
  const effectsEnabledRef = useRef(opts.effectsEnabled !== false);
  const playingRef = useRef(opts.playing);
  mutedRef.current = opts.muted;
  musicEnabledRef.current = opts.musicEnabled !== false;
  effectsEnabledRef.current = opts.effectsEnabled !== false;
  playingRef.current = opts.playing;
  const enabled = opts.enabled !== false;

  const fighterProfiles = useMemo(() => {
    if (!opts.builds || !opts.attackerId || !opts.defenderId) return [];
    return profilesFromFightBuilds({
      attackerId: opts.attackerId,
      defenderId: opts.defenderId,
      attacker: opts.builds.attacker,
      defender: opts.builds.defender,
    });
  }, [opts.attackerId, opts.defenderId, opts.builds]);

  // Profiles are baked into the session at create time; recreate when they change.
  const profileKey = fighterProfiles
    .map((p) => `${p.characterId}:${p.weaponSwingCue ?? ''}:${p.chassisHitCue ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!enabled) {
      sessionRef.current = null;
      return;
    }
    const session = createTrialAudioSession({
      backend: createExpoAvBackend(),
      sources: TRIAL_AUDIO_METRO_SOURCES,
      partSources: TRIAL_PART_AUDIO_METRO_SOURCES,
      ambientSource: TRIAL_AMBIENT_METRO_SOURCE,
      fighterProfiles,
      muted: mutedRef.current,
      musicEnabled: musicEnabledRef.current,
      effectsEnabled: effectsEnabledRef.current,
      playing: playingRef.current,
    });
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [enabled, profileKey, fighterProfiles]);

  useEffect(() => {
    sessionRef.current?.setMuted(opts.muted);
  }, [opts.muted]);

  useEffect(() => {
    sessionRef.current?.setMusicEnabled(opts.musicEnabled !== false);
  }, [opts.musicEnabled]);

  useEffect(() => {
    sessionRef.current?.setEffectsEnabled(opts.effectsEnabled !== false);
  }, [opts.effectsEnabled]);

  useEffect(() => {
    sessionRef.current?.setPlaying(opts.playing);
  }, [opts.playing]);

  const onCommand = useCallback((cmd: AnimationCommand) => {
    try {
      sessionRef.current?.notifyCommand(cmd);
    } catch {
      // Never desync fight on audio errors.
    }
  }, []);

  const playUiTap = useCallback(() => {
    try {
      sessionRef.current?.playUiTap();
    } catch {
      // ignore
    }
  }, []);

  const playCue = useCallback((id: TrialAudioUiCueId, options?: PlayCueOptions) => {
    try {
      sessionRef.current?.playCue(id, options);
    } catch {
      // ignore
    }
  }, []);

  const reset = useCallback(() => {
    try {
      sessionRef.current?.reset();
    } catch {
      // ignore
    }
  }, []);

  return { onCommand, playUiTap, playCue, reset };
}
