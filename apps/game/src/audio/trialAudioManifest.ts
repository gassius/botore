/** trial-audio-v001 manifest + sealed hashes (headless-safe). */
import { ACTIVE_TRIAL_AUDIO_ASSET_VERSION, type TrialAudioClipId } from './trialAudioPin';
import manifestJson from '../../assets/trial-audio-v001/manifest.json';

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

/** Sealed runtime subset from trial-audio-v001 SHA256SUMS. */
export const TRIAL_AUDIO_SEALED_SHA256 = {
  'manifest.json': '7760ed122b812d181b0f94c260576ae5b28d310d9f5cd6e23523ca87430d00b0',
  'clips/swing.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/hit.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/dodge.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/defeat.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/hush.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/ui-tap.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/win.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
  'clips/music-loop.m4a': '6cd3305ed9b1b0a11d58126b031d5993162f9b5542131013efcfa48c7162a8c5',
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
