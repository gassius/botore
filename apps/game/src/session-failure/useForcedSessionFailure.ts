import { useContext } from 'react';
import { FirstRunContext } from '../first-run/FirstRunContext';
import { peekCaptureIntent } from '../design-capture/pendingCaptureIntent';
import type { DesignCaptureSessionFailure } from '../design-capture/captureEnv';
import { resolveForcedSessionFailure } from './forcedSessionFailure';

/**
 * Design-capture: force offline / auth-expired banners for native stills.
 * Prefer FirstRun live override (replaced/cleared on every capture deep link)
 * so sequential stills never stick the previous sessionFailure.
 * Never active outside design-capture builds.
 */
export function useForcedSessionFailure(): DesignCaptureSessionFailure | null {
  const firstRun = useContext(FirstRunContext);
  if (firstRun) {
    return resolveForcedSessionFailure({
      intentFailure: firstRun.sessionFailureCapture,
      envRaw: process.env.EXPO_PUBLIC_DESIGN_CAPTURE_SESSION_FAILURE ?? null,
    });
  }
  return resolveForcedSessionFailure({
    intentFailure: peekCaptureIntent().sessionFailure,
    envRaw: process.env.EXPO_PUBLIC_DESIGN_CAPTURE_SESSION_FAILURE ?? null,
  });
}
