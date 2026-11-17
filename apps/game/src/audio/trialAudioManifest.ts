/** trial-audio-v003 manifest + sealed hashes (headless-safe). */
import { ACTIVE_TRIAL_AUDIO_ASSET_VERSION, type TrialAudioClipId } from './trialAudioPin';
import manifestJson from '../../assets/trial-audio-v003/manifest.json';

export interface TrialAudioClipSpec {
  readonly file: string;
  readonly kind: 'oneshot' | 'loop';
  readonly role: 'effects' | 'music';
  readonly trigger_event: string;
  readonly animation_command: string | null;
  readonly duration_target_s: readonly [number, number];
  readonly volume: number;
  readonly loop: boolean;
  readonly sound_tags: readonly string[];
  readonly placeholder: boolean;
  readonly loop_points_ms?: { readonly start: number; readonly end: number | null };
}

export interface TrialAudioManifest {
  readonly schema: string;
  readonly id: string;
  readonly version: string;
  readonly immutable: boolean;
  readonly status: string;
  readonly mood: string;
  readonly paid_generation: {
    readonly used: boolean;
    readonly credit_cost: number | null;
    readonly product_owner_go: boolean;
  };
  readonly clips: Record<TrialAudioClipId, TrialAudioClipSpec>;
}

export const TRIAL_AUDIO_MANIFEST = manifestJson as unknown as TrialAudioManifest;

if (TRIAL_AUDIO_MANIFEST.version !== ACTIVE_TRIAL_AUDIO_ASSET_VERSION) {
  throw new Error(
    `trial-audio pin mismatch: expected ${ACTIVE_TRIAL_AUDIO_ASSET_VERSION}, got ${TRIAL_AUDIO_MANIFEST.version}`,
  );
}

/** Sealed runtime subset from trial-audio-v003 SHA256SUMS. */
export const TRIAL_AUDIO_SEALED_SHA256 = {
  'manifest.json': '01de2413c9d0fd7ac868f1cbdd57f62f8f6cd1d5f83ca95b291b21b55bb2bef0',
  'clips/swing.m4a': '7d2c305c6669eec85289ccd625dbbfcf208b9bc9be3ee98abe11963ad1b3f2de',
  'clips/hit.m4a': 'e74a2f379af782e558a52cf7f6d80b5af48adc1ad2c3dc259469cfcfe7ed3314',
  'clips/dodge.m4a': 'afb0e5de45ebc70c1c1380f6bd59511c66fc05c2f129fdddbc501a2d9efc0429',
  'clips/defeat.m4a': '479ac3a4822403401baed02819441a590249525bce21893076928d6629eb1cb1',
  'clips/hush.m4a': '6035a5887decacf916ce52996d75c62f538b44d28c5516ed7f3154f054ae131e',
  'clips/ui-tap.m4a': '1ef47b9966fab0c900e16ad9de52017530f7cbf5951129a35419cd0d46db223b',
  'clips/win.m4a': 'c29c87d98f31069bb7eb89715bc990cf9861049c854c091fe769ad44ab220947',
  'clips/music-loop.m4a': 'eed28d558b8f7a1bd85b8f3e14650ddc50af87b376bd2a4dc3f453563d4134ff',
  'clips/new-record.m4a': '9def452c5be4a8f20d21d04bc781a2a44224c71e28944b3144cc93b90bc67417',
  'clips/xp-tick.m4a': 'a1900f7f24b0057c44311370bab329a374d634059fcf14e1bdd9e1667f435634',
  'clips/equip.m4a': 'c30f16736c6af67427ed6df4efe8d8f05e718540fc1c12a9a702e8794bc54a99',
  'clips/select.m4a': 'b02be1576dee9ba37d07b88bb06cd2bb879e0ce6fefc35f15331e7ae24752671',
} as const;

export function trialAudioClipVolume(id: TrialAudioClipId): number {
  const clip = TRIAL_AUDIO_MANIFEST.clips[id];
  const v = clip?.volume;
  if (typeof v !== 'number' || Number.isNaN(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

export function assertNoPaidGenerationWithoutGo(): void {
  const paid = TRIAL_AUDIO_MANIFEST.paid_generation;
  if (paid.used && !paid.product_owner_go) {
    throw new Error('trial-audio pack marks paid generation without product-owner go');
  }
}
