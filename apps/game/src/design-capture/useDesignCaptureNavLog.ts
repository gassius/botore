import { useEffect } from 'react';
import type { FirstRunRoute } from '../first-run/routes';
import { isDesignCaptureEnabled } from './captureEnv';

export function formatCaptureNavLog(route: FirstRunRoute, showResultOverlay: boolean): string {
  return `BOTORE_CAPTURE_NAV:route=${route} overlay=${showResultOverlay ? 1 : 0}`;
}

/**
 * Design-capture only: log every shell route / Result-overlay change so native
 * CI can assert where a tapped Back actually landed (not just pixels).
 */
export function useDesignCaptureNavLog(route: FirstRunRoute, showResultOverlay: boolean): void {
  useEffect(() => {
    if (!isDesignCaptureEnabled()) return;
    console.log(formatCaptureNavLog(route, showResultOverlay));
  }, [route, showResultOverlay]);
}
