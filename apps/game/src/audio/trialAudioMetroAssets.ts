/** Metro requires for trial-audio-v004 clips. UI-only — keep out of headless tests. */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { TrialAudioClipId } from './trialAudioPin';
import type { AudioSource } from './audioBackend';

export const TRIAL_AUDIO_METRO_SOURCES: Readonly<Record<TrialAudioClipId, AudioSource>> = {
  swing: require('../../assets/trial-audio-v004/clips/swing.m4a') as AudioSource,
  hit: require('../../assets/trial-audio-v004/clips/hit.m4a') as AudioSource,
  dodge: require('../../assets/trial-audio-v004/clips/dodge.m4a') as AudioSource,
  defeat: require('../../assets/trial-audio-v004/clips/defeat.m4a') as AudioSource,
  hush: require('../../assets/trial-audio-v004/clips/hush.m4a') as AudioSource,
  uiTap: require('../../assets/trial-audio-v004/clips/ui-tap.m4a') as AudioSource,
  win: require('../../assets/trial-audio-v004/clips/win.m4a') as AudioSource,
  musicLoop: require('../../assets/trial-audio-v004/clips/music-loop.m4a') as AudioSource,
  newRecord: require('../../assets/trial-audio-v004/clips/new-record.m4a') as AudioSource,
  xpTick: require('../../assets/trial-audio-v004/clips/xp-tick.m4a') as AudioSource,
  equip: require('../../assets/trial-audio-v004/clips/equip.m4a') as AudioSource,
  select: require('../../assets/trial-audio-v004/clips/select.m4a') as AudioSource,
  menuLoop: require('../../assets/trial-audio-v004/clips/menu-loop.m4a') as AudioSource,
  splashSting: require('../../assets/trial-audio-v004/clips/splash-sting.m4a') as AudioSource,
  faceOffSting: require('../../assets/trial-audio-v004/clips/face-off-sting.m4a') as AudioSource,
  uiConfirm: require('../../assets/trial-audio-v004/clips/ui-confirm.m4a') as AudioSource,
  uiBack: require('../../assets/trial-audio-v004/clips/ui-back.m4a') as AudioSource,
  uiTab: require('../../assets/trial-audio-v004/clips/ui-tab.m4a') as AudioSource,
  uiSnap: require('../../assets/trial-audio-v004/clips/ui-snap.m4a') as AudioSource,
  uiCreate: require('../../assets/trial-audio-v004/clips/ui-create.m4a') as AudioSource,
  uiError: require('../../assets/trial-audio-v004/clips/ui-error.m4a') as AudioSource,
  uiToggle: require('../../assets/trial-audio-v004/clips/ui-toggle.m4a') as AudioSource,
};

