/** Trial audio pack (F11/C14) — headless-safe exports. Runtime hook lives in useTrialReplayAudio. */
export {
  ACTIVE_TRIAL_AUDIO_ASSET_VERSION,
  TRIAL_AUDIO_CLIP_IDS,
  TRIAL_AUDIO_UI_CUE_IDS,
  type ActiveTrialAudioAssetVersion,
  type TrialAudioClipId,
  type TrialAudioUiCueId,
} from './trialAudioPin';
export {
  TRIAL_AUDIO_MANIFEST,
  TRIAL_AUDIO_SEALED_SHA256,
  assertNoPaidGenerationWithoutGo,
  trialAudioClipVolume,
  type TrialAudioClipSpec,
  type TrialAudioManifest,
} from './trialAudioManifest';
export { sfxClipFromCommand, shouldStartMusicLoop, shouldStopMusicLoop } from './cueFromCommand';
export {
  ARENA_AMBIENT_VOLUME,
  PART_AUDIO_CUE_IDS,
  chassisHitCueFromBuild,
  fighterAudioProfile,
  profilesFromFightBuilds,
  resolveOneShotCue,
  shouldStartAmbientLoop,
  shouldStopAmbientLoop,
  weaponSwingCueFromBuild,
  type FighterAudioProfile,
  type PartAudioCueId,
  type ResolvedOneShotCue,
} from './partAudioResolve';
export {
  createTrialAudioSession,
  type TrialAudioSession,
  type TrialAudioSessionOptions,
  type TrialAudioSources,
  type TrialPartAudioSources,
} from './TrialAudioSession';
export {
  createNoopAudioBackend,
  type AudioSource,
  type LoopHandle,
  type OneShotHandle,
  type TrialAudioBackend,
} from './audioBackend';
export {
  createExpoAvBackend,
  TRIAL_AUDIO_PLATFORM_MODE,
  TRIAL_AUDIO_INTERRUPTION_DO_NOT_MIX,
  type ExpoAvBackendOptions,
  type ExpoAvModule,
} from './expoAvBackend';
export {
  XP_TICK_MIN_INTERVAL_MS,
  XP_TICK_RATE_MAX,
  XP_TICK_RATE_MIN,
  XP_TICK_VOLUME_SCALE_MAX,
  XP_TICK_VOLUME_SCALE_MIN,
  createXpTickGate,
  resolveUiCuePlay,
  shouldPlayEquipCue,
  shouldPlayNewRecordCue,
  shouldPlaySelectCue,
  xpTickVariation,
  type UiCuePlayRequest,
  type XpTickGate,
  type XpTickVariation,
} from './uiCueHelpers';
