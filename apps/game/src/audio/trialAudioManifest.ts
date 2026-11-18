/** trial-audio-v004 manifest + sealed hashes (headless-safe). */
import { ACTIVE_TRIAL_AUDIO_ASSET_VERSION, type TrialAudioClipId } from './trialAudioPin';
import manifestJson from '../../assets/trial-audio-v004/manifest.json';

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

/** Sealed runtime subset from trial-audio-v004 SHA256SUMS. */
export const TRIAL_AUDIO_SEALED_SHA256 = {
  'manifest.json': '07265b869ba8953fac5684c1e58e4aeb71ce8354bd5b4db58aef120d2c067889',
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
  'clips/menu-loop.m4a': 'f0400af1efbbf85dfdb234e1604df7b175d38ae3f9e656073c3ba53b4c6ef0d2',
  'clips/splash-sting.m4a': 'cc70655d1c023c1e148891a53f2bd060eba8a4179bebe82227b325c70cb3d282',
  'clips/ui-confirm.m4a': '7e727511c5a9a44a21ec427f6a5662732ae68b648b6b34f84a7b8c2ed59af47b',
  'clips/ui-back.m4a': '135a5e0e22252c34eebbcce5f54998f838298be5937e83e21b7f2edc50bab9d3',
  'clips/ui-tab.m4a': '4dba713a101fd3be47407313c2b3e269bb8256ba4ce0480dc539c65c38673f99',
  'clips/ui-snap.m4a': '0f669ab5d3d76723a3afc69193d3a50e27261455a907ec62b72d71fdab44bb1c',
  'clips/ui-create.m4a': '4e14bad1d81dd679b6b7b821563856690f90b936c82c728ee0ff1ed6b8b1edab',
  'clips/ui-error.m4a': '956008cf18a3a292c4bcc378280a51bc36bcc1d2c7b81f0af4b68c470b82744b',
  'clips/ui-toggle.m4a': 'f3dd5de2ac35a00a08f6eae7fc4e1b39a1b44e2d3a9f2050fb28cdd3f345f452',
  'clips/face-off-sting.m4a': '646d39195798fd908d503b980de4d9edf93690fa9ba56a535a07f1a664746c6e',
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
