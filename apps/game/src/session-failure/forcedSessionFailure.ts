import {
  isDesignCaptureEnabled,
  parseDesignCaptureSessionFailure,
  type DesignCaptureSessionFailure,
} from '../design-capture/captureEnv';

/**
 * Design-capture override for offline / auth-expired stills (C10).
 * Pure: pass intent + env; screens wire RN peek separately.
 */
export function resolveForcedSessionFailure(input: {
  readonly enabled?: boolean;
  readonly intentFailure?: DesignCaptureSessionFailure | null;
  readonly envRaw?: string | null;
}): DesignCaptureSessionFailure | null {
  const enabled = input.enabled ?? isDesignCaptureEnabled();
  if (!enabled) return null;
  if (input.intentFailure === 'offline' || input.intentFailure === 'auth_expired') {
    return input.intentFailure;
  }
  return parseDesignCaptureSessionFailure(input.envRaw ?? undefined);
}
