/**
 * Active trial audio pack pin for F11 replay SFX + fight loop.
 * Placeholders only — mood provisional; not final / not native-accepted.
 */
export const ACTIVE_TRIAL_AUDIO_ASSET_VERSION = 'trial-audio-v001' as const;
export type ActiveTrialAudioAssetVersion = typeof ACTIVE_TRIAL_AUDIO_ASSET_VERSION;

/** Clip ids matching trial-audio-v001 manifest. */
export type TrialAudioClipId =
  | 'swing'
  | 'hit'
  | 'dodge'
  | 'defeat'
  | 'hush'
  | 'uiTap'
  | 'win'
  | 'musicLoop';

export const TRIAL_AUDIO_CLIP_IDS: readonly TrialAudioClipId[] = [
  'swing',
  'hit',
  'dodge',
  'defeat',
  'hush',
  'uiTap',
  'win',
  'musicLoop',
] as const;
