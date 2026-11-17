/** Metro requires for trial-audio-v002 clips. UI-only — keep out of headless tests. */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { TrialAudioClipId } from './trialAudioPin';
import type { AudioSource } from './audioBackend';

export const TRIAL_AUDIO_METRO_SOURCES: Readonly<Record<TrialAudioClipId, AudioSource>> = {
  swing: require('../../assets/trial-audio-v002/clips/swing.m4a') as AudioSource,
  hit: require('../../assets/trial-audio-v002/clips/hit.m4a') as AudioSource,
  dodge: require('../../assets/trial-audio-v002/clips/dodge.m4a') as AudioSource,
  defeat: require('../../assets/trial-audio-v002/clips/defeat.m4a') as AudioSource,
  hush: require('../../assets/trial-audio-v002/clips/hush.m4a') as AudioSource,
  uiTap: require('../../assets/trial-audio-v002/clips/ui-tap.m4a') as AudioSource,
  win: require('../../assets/trial-audio-v002/clips/win.m4a') as AudioSource,
  musicLoop: require('../../assets/trial-audio-v002/clips/music-loop.m4a') as AudioSource,
};
