import { useEffect, useRef, useState } from 'react';
import { formatRefillCountdown, msUntilRefill } from './fightQuotaTypes';

/**
 * Live HH:MM:SS countdown derived only from server nextRefillAt.
 * Tick every second while the target is in the future.
 * When the countdown crosses to 0, invoke onExpired once so the parent can
 * refresh quota from the server (E3 refill).
 */
export function useRefillCountdown(
  nextRefillAt: string | null | undefined,
  onExpired?: () => void,
): {
  readonly label: string;
  readonly expired: boolean;
  readonly msRemaining: number;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const firedRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    firedRef.current = false;
    if (!nextRefillAt) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [nextRefillAt]);

  const msRemaining = nextRefillAt ? msUntilRefill(nextRefillAt, nowMs) : 0;
  const expired = !nextRefillAt || msRemaining <= 0;

  useEffect(() => {
    if (!nextRefillAt || !expired || firedRef.current) return;
    firedRef.current = true;
    onExpiredRef.current?.();
  }, [expired, nextRefillAt]);

  if (!nextRefillAt) {
    return { label: '00:00:00', expired: true, msRemaining: 0 };
  }
  return {
    label: formatRefillCountdown(msRemaining),
    expired,
    msRemaining,
  };
}
