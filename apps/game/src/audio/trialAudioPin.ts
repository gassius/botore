/**
 * Active trial audio pack pin for F11 replay SFX + fight loop.
 * trial-audio-v004: v003 + Ludus/hangar menu loop, splash sting, Tale of the Tape face-off sting, and full UI button family; real ElevenLabs audio, pending ear approval on phone.
 */
export const ACTIVE_TRIAL_AUDIO_ASSET_VERSION = 'trial-audio-v004' as const;
export type ActiveTrialAudioAssetVersion = typeof ACTIVE_TRIAL_AUDIO_ASSET_VERSION;

/** Clip ids matching trial-audio-v004 manifest. */
export type TrialAudioClipId =
  | 'swing'
  | 'hit'
  | 'dodge'
  | 'defeat'
  | 'hush'
  | 'uiTap'
  | 'win'
  | 'musicLoop'
  | 'newRecord'
  | 'xpTick'
  | 'equip'
  | 'select'
  | 'menuLoop'
  | 'splashSting'
  | 'faceOffSting'
  | 'uiConfirm'
  | 'uiBack'
  | 'uiTab'
  | 'uiSnap'
  | 'uiCreate'
  | 'uiError'
  | 'uiToggle';

export const TRIAL_AUDIO_CLIP_IDS: readonly TrialAudioClipId[] = [
  'swing',
  'hit',
  'dodge',
  'defeat',
  'hush',
  'uiTap',
  'win',
  'musicLoop',
  'newRecord',
  'xpTick',
  'equip',
  'select',
  'menuLoop',
  'splashSting',
  'faceOffSting',
  'uiConfirm',
  'uiBack',
  'uiTab',
  'uiSnap',
  'uiCreate',
  'uiError',
  'uiToggle',
] as const;

/** Screen-driven one-shots played via TrialAudioSession.playCue (effects channel). */
export type TrialAudioUiCueId =
  | 'newRecord'
  | 'xpTick'
  | 'equip'
  | 'select'
  | 'uiConfirm'
  | 'uiBack'
  | 'uiTab'
  | 'uiSnap'
  | 'uiCreate'
  | 'uiError'
  | 'uiToggle';

export const TRIAL_AUDIO_UI_CUE_IDS: readonly TrialAudioUiCueId[] = [
  'newRecord',
  'xpTick',
  'equip',
  'select',
  'uiConfirm',
  'uiBack',
  'uiTab',
  'uiSnap',
  'uiCreate',
  'uiError',
  'uiToggle',
] as const;
