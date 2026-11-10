/**
 * C8 — fail-closed playable builds.
 *
 * Preview / production (and any non-DEV playable profile) must never silently
 * fall back to DEV golden fights or invented XP when Supabase public env is
 * missing. Design-capture and explicit DEV profiles may keep labelled scaffolds.
 *
 * Expo inlines only static `process.env.EXPO_PUBLIC_*` member expressions.
 * Do not alias `process.env` or index it dynamically.
 */

import { isDesignCaptureEnabled } from '../design-capture/captureEnv';

function trimPublic(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function truthyFlag(raw: string | undefined): boolean {
  const v = trimPublic(raw)?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Stable error code for misconfigured playable builds. */
export const PLAYABLE_MISCONFIGURED_CODE = 'playable_misconfigured' as const;

export const PLAYABLE_MISCONFIGURED_TITLE = 'Backend required';

export const PLAYABLE_MISCONFIGURED_DETAIL =
  'This playable build needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Without them auth, opponents, fights, and XP stay blocked — DEV golden fights are not used.';

/**
 * Force fail-closed even under design-capture (evidence stills for C8).
 * Never bake into preview/production store profiles.
 */
export function isDesignCaptureFailClosed(
  flag: string | undefined = process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED,
): boolean {
  return truthyFlag(flag);
}

/**
 * Explicit DEV scaffold opt-in (EAS `design-review` / `development` profiles).
 */
export function isDevScaffoldExplicitlyAllowed(
  flag: string | undefined = process.env.EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD,
): boolean {
  return truthyFlag(flag);
}

/**
 * True when labelled DEV scaffolds (local auth, golden fights, fixture ranking)
 * are permitted. False for preview/production playable builds.
 */
export function isDevScaffoldAllowed(opts?: {
  allowDevScaffold?: string | undefined;
  designCapture?: string | undefined;
  designCaptureFailClosed?: string | undefined;
  /** Override Metro `__DEV__` (tests). When omitted, reads global `__DEV__`. */
  metroDev?: boolean;
}): boolean {
  if (
    isDesignCaptureFailClosed(
      opts?.designCaptureFailClosed ?? process.env.EXPO_PUBLIC_DESIGN_CAPTURE_FAIL_CLOSED,
    )
  ) {
    return false;
  }

  if (
    isDevScaffoldExplicitlyAllowed(
      opts?.allowDevScaffold ?? process.env.EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD,
    )
  ) {
    return true;
  }

  if (isDesignCaptureEnabled(opts?.designCapture ?? process.env.EXPO_PUBLIC_DESIGN_CAPTURE)) {
    return true;
  }

  const metroDev = opts?.metroDev ?? (typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false);
  return metroDev;
}

/** Inverse of {@link isDevScaffoldAllowed} — playable builds must use live adapters. */
export function isPlayableFailClosed(opts?: Parameters<typeof isDevScaffoldAllowed>[0]): boolean {
  return !isDevScaffoldAllowed(opts);
}
