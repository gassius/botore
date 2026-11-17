/**
 * Active trial audio pack pin for F11 replay SFX + fight loop.
 * trial-audio-v002: real ElevenLabs audio, pending ear approval on phone.
 */
export const ACTIVE_TRIAL_AUDIO_ASSET_VERSION = 'trial-audio-v002' as const;
export type ActiveTrialAudioAssetVersion = typeof ACTIVE_TRIAL_AUDIO_ASSET_VERSION;

/** Clip ids matching trial-audio-v002 manifest. */
export type TrialAudioClipId =
  'swing' | 'hit' | 'dodge' | 'defeat' | 'hush' | 'uiTap' | 'win' | 'musicLoop';

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
