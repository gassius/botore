/** Trial audio pack (F11) — headless-safe exports. Runtime hook lives in useTrialReplayAudio. */
export {
  ACTIVE_TRIAL_AUDIO_ASSET_VERSION,
  TRIAL_AUDIO_CLIP_IDS,
  type ActiveTrialAudioAssetVersion,
  type TrialAudioClipId,
} from './trialAudioPin';
export {
  TRIAL_AUDIO_MANIFEST,
  TRIAL_AUDIO_SEALED_SHA256,
  assertNoPaidGenerationWithoutGo,
  trialAudioClipVolume,
  type TrialAudioClipSpec,
  type TrialAudioManifest,
} from './trialAudioManifest';
export {
  sfxClipFromCommand,
  shouldStartMusicLoop,
  shouldStopMusicLoop,
} from './cueFromCommand';
export {
  createTrialAudioSession,
  type TrialAudioSession,
  type TrialAudioSessionOptions,
  type TrialAudioSources,
} from './TrialAudioSession';
export {
  createNoopAudioBackend,
  type AudioSource,
  type LoopHandle,
  type TrialAudioBackend,
} from './audioBackend';
