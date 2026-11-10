/**
 * C15 — AuthEntry copy + field defaults by build profile.
 *
 * Playable / preview / production: player-facing copy, empty email/password.
 * Prefill + developer copy only when design-capture or explicit DEV scaffold
 * (`EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD`) is allowed — not for plain Metro `__DEV__`
 * alone, so local playable checks match production UX.
 *
 * This module must stay free of DEV credential / developer-copy string
 * literals so the playable AuthEntry surface does not embed them.
 */

import { isDesignCaptureEnabled } from '../../design-capture/captureEnv';
import {
  isDesignCaptureFailClosed,
  isDevScaffoldExplicitlyAllowed,
} from '../../runtime/devScaffoldPolicy';
import { getDevAuthEntryPresentation } from './authEntryDevAssist';

export const AUTH_ENTRY_PLAYER_SUBTITLE = 'Sign in to open your stable.';

export type AuthEntryAuthKind = 'dev' | 'supabase' | 'unavailable';

export type AuthEntryPresentation = {
  readonly email: string;
  readonly password: string;
  readonly subtitle: string;
  /** Developer footnote; null on playable builds. */
  readonly footnote: string | null;
  readonly showDevAssist: boolean;
};

/**
 * Prefill + DEV AuthEntry chrome when design-capture or ALLOW_DEV_SCAFFOLD.
 * Fail-closed design-capture still suppresses assist (C8 evidence stills).
 */
export function isAuthEntryDevAssistEnabled(opts?: {
  allowDevScaffold?: string | undefined;
  designCapture?: string | undefined;
  designCaptureFailClosed?: string | undefined;
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

  return isDesignCaptureEnabled(opts?.designCapture ?? process.env.EXPO_PUBLIC_DESIGN_CAPTURE);
}

/** Resolve field defaults + copy for AuthEntry (pure; safe for unit tests). */
export function resolveAuthEntryPresentation(
  authKind: AuthEntryAuthKind,
  opts?: Parameters<typeof isAuthEntryDevAssistEnabled>[0],
): AuthEntryPresentation {
  const showDevAssist = isAuthEntryDevAssistEnabled(opts);
  if (!showDevAssist) {
    return {
      email: '',
      password: '',
      subtitle: AUTH_ENTRY_PLAYER_SUBTITLE,
      footnote: null,
      showDevAssist: false,
    };
  }

  return getDevAuthEntryPresentation(authKind);
}
