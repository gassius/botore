import { useMemo } from 'react';
import { peekCaptureIntent } from '../design-capture/pendingCaptureIntent';
import type { DesignCaptureSessionFailure } from '../design-capture/captureEnv';
import { resolveForcedSessionFailure } from './forcedSessionFailure';

/**
 * Design-capture: force offline / auth-expired banners for native stills.
 * Never active outside design-capture builds.
 */
export function useForcedSessionFailure(): DesignCaptureSessionFailure | null {
  return useMemo(
    () =>
      resolveForcedSessionFailure({
        intentFailure: peekCaptureIntent().sessionFailure,
        envRaw: process.env.EXPO_PUBLIC_DESIGN_CAPTURE_SESSION_FAILURE ?? null,
      }),
    [],
  );
}
