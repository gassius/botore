/**
 * Hook that binds a TrialAudioSession to CanonicalReplayPlayer lifecycle.
 * Prefers the app-wide shared session (menu + fight on one stack).
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
import { useSharedTrialAudio } from './trialAudioContext';

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
  const shared = useSharedTrialAudio();
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

  // Profiles are baked into the local session at create time; recreate when they change.
  // Shared session updates profiles in place so menu music is not torn down.
  const profileKey = fighterProfiles
    .map((p) => `${p.characterId}:${p.weaponSwingCue ?? ''}:${p.chassisHitCue ?? ''}`)
    .join('|');

  useEffect(() => {
    if (shared) {
      shared.setFighterProfiles(fighterProfiles);
      sessionRef.current = null;
      return;
    }
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
  }, [enabled, profileKey, fighterProfiles, shared]);

  useEffect(() => {
    // Belt-and-suspenders: shared session also tracks FirstRun mute via the
    // PlayerSettingsProvider → TrialAudioProvider path; keep in sync if props move.
    if (shared) {
      shared.getSession()?.setMuted(opts.muted);
      return;
    }
    sessionRef.current?.setMuted(opts.muted);
  }, [opts.muted, shared]);

  useEffect(() => {
    if (shared) {
      shared.getSession()?.setMusicEnabled(opts.musicEnabled !== false);
      return;
    }
    sessionRef.current?.setMusicEnabled(opts.musicEnabled !== false);
  }, [opts.musicEnabled, shared]);

  useEffect(() => {
    if (shared) {
      shared.getSession()?.setEffectsEnabled(opts.effectsEnabled !== false);
      return;
    }
    sessionRef.current?.setEffectsEnabled(opts.effectsEnabled !== false);
  }, [opts.effectsEnabled, shared]);

  useEffect(() => {
    if (!enabled) return;
    if (shared) {
      shared.setPlaying(opts.playing);
      return () => {
        // Leaving the fight: restore session so menuLoop is not fight-paused.
        shared.setPlaying(true);
      };
    }
    sessionRef.current?.setPlaying(opts.playing);
  }, [opts.playing, shared, enabled]);

  const onCommand = useCallback(
    (cmd: AnimationCommand) => {
      try {
        if (!enabled) return;
        if (shared) {
          shared.notifyCommand(cmd);
          return;
        }
        sessionRef.current?.notifyCommand(cmd);
      } catch {
        // Never desync fight on audio errors.
      }
    },
    [shared, enabled],
  );

  const playUiTap = useCallback(() => {
    try {
      if (!enabled) return;
      if (shared) {
        shared.playUiTap();
        return;
      }
      sessionRef.current?.playUiTap();
    } catch {
      // ignore
    }
  }, [shared, enabled]);

  const playCue = useCallback(
    (id: TrialAudioUiCueId, options?: PlayCueOptions) => {
      try {
        if (!enabled) return;
        if (shared) {
          shared.playCue(id, options);
          return;
        }
        sessionRef.current?.playCue(id, options);
      } catch {
        // ignore
      }
    },
    [shared, enabled],
  );

  const reset = useCallback(() => {
    try {
      if (!enabled) return;
      if (shared) {
        shared.reset();
        return;
      }
      sessionRef.current?.reset();
    } catch {
      // ignore
    }
  }, [shared, enabled]);

  return { onCommand, playUiTap, playCue, reset };
}
