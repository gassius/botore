/** Metro requires for trial-audio-v003 clips. UI-only — keep out of headless tests. */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { TrialAudioClipId } from './trialAudioPin';
import type { AudioSource } from './audioBackend';

export const TRIAL_AUDIO_METRO_SOURCES: Readonly<Record<TrialAudioClipId, AudioSource>> = {
  swing: require('../../assets/trial-audio-v003/clips/swing.m4a') as AudioSource,
  hit: require('../../assets/trial-audio-v003/clips/hit.m4a') as AudioSource,
  dodge: require('../../assets/trial-audio-v003/clips/dodge.m4a') as AudioSource,
  defeat: require('../../assets/trial-audio-v003/clips/defeat.m4a') as AudioSource,
  hush: require('../../assets/trial-audio-v003/clips/hush.m4a') as AudioSource,
  uiTap: require('../../assets/trial-audio-v003/clips/ui-tap.m4a') as AudioSource,
  win: require('../../assets/trial-audio-v003/clips/win.m4a') as AudioSource,
  musicLoop: require('../../assets/trial-audio-v003/clips/music-loop.m4a') as AudioSource,
  newRecord: require('../../assets/trial-audio-v003/clips/new-record.m4a') as AudioSource,
  xpTick: require('../../assets/trial-audio-v003/clips/xp-tick.m4a') as AudioSource,
  equip: require('../../assets/trial-audio-v003/clips/equip.m4a') as AudioSource,
  select: require('../../assets/trial-audio-v003/clips/select.m4a') as AudioSource,
};
