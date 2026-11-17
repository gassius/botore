/**
 * Metro requires for atlas part + arena ambient clips used by the trial fight path.
 * UI-only — keep out of headless tests. Catalogue download remains the long-term
 * path; these bundles keep C14 weapon/chassis/ambient hearable in the next APK.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { AudioSource } from './audioBackend';
import type { PartAudioCueId } from './partAudioResolve';

export const TRIAL_PART_AUDIO_METRO_SOURCES: Readonly<Record<PartAudioCueId, AudioSource>> = {
  weaponSwordSwing: require('../../assets/atlas/parts/weapon-sword/swing.m4a') as AudioSource,
  weaponAxeSwing: require('../../assets/atlas/parts/weapon-axe/swing.m4a') as AudioSource,
  weaponDaggerSwing: require('../../assets/atlas/parts/weapon-dagger/swing.m4a') as AudioSource,
  chassisBasicHit: require('../../assets/atlas/parts/chassis-basic/hit.m4a') as AudioSource,
};

export const TRIAL_AMBIENT_METRO_SOURCE: AudioSource = require('../../assets/atlas/arenas/quiet/ambient.m4a') as AudioSource;
