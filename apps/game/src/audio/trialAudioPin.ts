/**
 * Active trial audio pack pin for F11 replay SFX + fight loop.
 * trial-audio-v003: v002 + Result/Customise UI cues; real ElevenLabs audio, pending ear approval on phone.
 */
export const ACTIVE_TRIAL_AUDIO_ASSET_VERSION = 'trial-audio-v003' as const;
export type ActiveTrialAudioAssetVersion = typeof ACTIVE_TRIAL_AUDIO_ASSET_VERSION;

/** Clip ids matching trial-audio-v003 manifest. */
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
  | 'select';

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
] as const;

/** Screen-driven one-shots (Result overlay + Customise), played via TrialAudioSession.playCue. */
export type TrialAudioUiCueId = 'newRecord' | 'xpTick' | 'equip' | 'select';

export const TRIAL_AUDIO_UI_CUE_IDS: readonly TrialAudioUiCueId[] = [
  'newRecord',
  'xpTick',
  'equip',
  'select',
] as const;
